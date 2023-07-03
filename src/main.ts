import * as core from '@actions/core'
import * as webhooks from '@octokit/webhooks-types'
import * as github from '@actions/github'

import {GitClient} from './internal-git'
import {AuthorizedUriFactory} from './internal-authorized-uri'
import {FetcherFactory} from './internal-fetcher'
import {PatcherFactory} from './internal-patcher'
import path from 'path'
import * as io from '@actions/io'

async function doPullRequest(): Promise<void> {
  const wrkdir = core.getInput('wrkdir')
  await io.mkdirP(wrkdir)

  const upstreamUri = AuthorizedUriFactory.create(
    core.getInput('upstream-uri'),
    'upstream-'
  )

  const pullRequestPayload = github.context.payload as webhooks.PullRequestEvent
  const cloneUrl = pullRequestPayload.repository.clone_url
  const baseRef = pullRequestPayload.pull_request.base.ref
  const headSha = pullRequestPayload.pull_request.head.sha
  const id = pullRequestPayload.pull_request.id
  const gitPrefix = `patch-review-${id}`

  const fetcher = FetcherFactory.create(upstreamUri)
  const patcher = PatcherFactory.create(core.getInput('patches'))

  const authorizedUri = AuthorizedUriFactory.create(cloneUrl)

  const wrkdirGitClient = new GitClient(authorizedUri, wrkdir, gitPrefix)
  const gitClient = new GitClient(authorizedUri, path.resolve(), gitPrefix)

  core.startGroup('Create upstream baseline')
  await fetcher.fetch(wrkdir)
  await io.cp('.github', `${path.join(wrkdir, '.github')}`, {recursive: true})
  await wrkdirGitClient.mark('baseline')
  core.endGroup()

  core.startGroup('Create patched head')
  await patcher.patch(wrkdir)
  await wrkdirGitClient.mark('head')
  core.endGroup()

  core.startGroup('Create patched base')
  await wrkdirGitClient.checkout('baseline')
  await gitClient.checkoutHasPrefix(baseRef)
  await patcher.patch(wrkdir)
  await wrkdirGitClient.mark('base')
  core.endGroup()

  core.startGroup('Create mergable diff')
  await wrkdirGitClient.diff('base', 'head', 'diff.patch')
  await PatcherFactory.create(`${wrkdir}/diff.patch`).patch(wrkdir)
  await io.rmRF(`${wrkdir}/diff.patch`)
  await wrkdirGitClient.mark('diffhead')
  core.endGroup()

  core.startGroup('Create review pull')
  await wrkdirGitClient.push('base')
  await wrkdirGitClient.push('diffhead')
  const octokit = github.getOctokit(core.getInput('token'))

  const pullList = await octokit.rest.pulls.list({
    owner: pullRequestPayload.repository.owner.name!,
    repo: pullRequestPayload.repository.name,
    state: 'open',
    base: wrkdirGitClient.addPrefix('base'),
    head: wrkdirGitClient.addPrefix('diffhead')
  })

  let pull
  if (pullList.data.length) {
    pull = pullList.data[0]
  } else {
    const createdPull = await octokit.rest.pulls.create({
      owner: pullRequestPayload.repository.owner.name!,
      repo: pullRequestPayload.repository.name,
      title: gitPrefix,
      base: wrkdirGitClient.addPrefix('base'),
      head: wrkdirGitClient.addPrefix('diffhead')
    })
    pull = createdPull.data
  }

  const labels = await octokit.rest.issues.listLabelsOnIssue({
    owner: pullRequestPayload.repository.owner.name!,
    repo: pullRequestPayload.repository.name,
    issue_number: pull.number
  })

  for (const label of labels.data) {
    if (label.name.startsWith('patch-review-')) {
      await octokit.rest.issues.deleteLabel({
        owner: pullRequestPayload.repository.owner.name!,
        repo: pullRequestPayload.repository.name,
        name: label.name
      })
    }
  }

  await octokit.rest.issues.addLabels({
    owner: pullRequestPayload.repository.owner.name!,
    repo: pullRequestPayload.repository.name,
    issue_number: pull.number,
    labels: [`patch-review-${headSha.substring(0, 7)}`]
  })

  await octokit.rest.repos.createCommitStatus({
    owner: pullRequestPayload.repository.owner.name!,
    repo: pullRequestPayload.repository.name,
    sha: headSha,
    state: 'pending',
    target_url: pull.html_url,
    context: 'Patch review'
  })

  core.endGroup()
}

async function doPullRequestReview(): Promise<void> {
  const pullRequestPayload = github.context
    .payload as webhooks.PullRequestReviewEvent

  let state: 'success' | 'pending' = 'pending'
  if (pullRequestPayload.review.state === 'approved') {
    state = 'success'
  }

  const octokit = github.getOctokit(core.getInput('token'))
  const labels = await octokit.rest.issues.listLabelsOnIssue({
    owner: pullRequestPayload.repository.owner.name!,
    repo: pullRequestPayload.repository.name,
    issue_number: pullRequestPayload.pull_request.number
  })

  for (const label of labels.data) {
    if (label.name.startsWith('patch-review-')) {
      octokit.rest.repos.createCommitStatus({
        owner: pullRequestPayload.repository.owner.name!,
        repo: pullRequestPayload.repository.name,
        sha: label.name.split('-').at(-1)!,
        state,
        context: 'Patch review'
      })
    }
  }
}

async function run(): Promise<void> {
  try {
    const eventName = github.context.eventName

    if (eventName === 'pull_request') {
      await doPullRequest()
    } else if (eventName === 'pull_request_review') {
      await doPullRequestReview()
    } else {
      core.error(`Unknown event type: ${eventName}`)
    }
  } catch (error) {
    if (error instanceof Error) core.setFailed(error.message)
  }
}

run()
