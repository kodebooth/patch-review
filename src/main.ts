import * as core from '@actions/core'
import * as github from '@actions/github'
import * as webhooks from '@octokit/webhooks-types'
import * as glob from '@actions/glob'
import * as octokit from '@octokit/core'
import * as exec from '@actions/exec'
import * as uri from 'uri-js'
import * as io from '@actions/io'
import * as git from 'simple-git'
import * as path from 'path'
import { SimpleGit } from 'simple-git'
import { Response } from 'simple-git'

function gitClient(_path?: string): Response<string> {
  return git.simpleGit(_path).init().addConfig('user.name', '[patch-review-bot]').addConfig('user.email', '[patch-review-bot]')
}

async function file_fetcher(client: SimpleGit, _path: string, dst:string): Promise<void> {
  core.debug(`Copying from ${_path} to ${dst}`)

  await io.cp(_path, dst, { recursive: true })
  await client.add('.').commit('baseline').addTag('baseline')
}

async function git_fetcher(client: SimpleGit, uri: string, dst:string): Promise<void> {
  core.debug(`Cloning from ${uri} to ${dst}`)

  await client.clone(uri, dst, {'--depth': 1 }).addTag('baseline')
}

async function http_fetcher(client: SimpleGit, _uri: string, dst:string): Promise<void> {
  core.debug(`Downloading from ${_uri} to ${dst}`)

  const parsedUri = uri.parse(_uri)
  const parsedPath = path.parse(parsedUri.path!)

  await exec.exec('curl', ['--location', '--fail', '--output', parsedPath.base, _uri])
  await io.mkdirP(dst)
  await exec.exec('tar', ['--extract', `--file=${parsedPath.base}`, '--strip-components=1', '-C', dst])

  await client.add('.').commit('baseline').addTag('baseline')
}

async function fetch(client: SimpleGit, _uri: string, dst: string): Promise<void> {

  core.debug(`Fetch from ${_uri}:`)
  const parsedUri = uri.parse(_uri)
  core.debug(`${JSON.stringify(parsedUri)}`)

  switch (parsedUri.scheme) {
    case 'file': {
      return file_fetcher(client, parsedUri.host!, dst)
    }
    case 'git': {
      return git_fetcher(client, _uri, dst)
    }
    case 'http': {
      return http_fetcher(client, _uri, dst)
    }
    case 'https': {
      return http_fetcher(client, _uri, dst)
    }
  }
}

async function patch(patches: string, path: string): Promise<Boolean> {
    const globOptions = {
      followSymbolicLinks: core.getInput('follow-symbolic-links').toUpperCase() !== 'FALSE'
    }
    const globber = await glob.create(patches, globOptions)
    const patch_files = await globber.glob()

    core.debug(`Patching with: ${patch_files}`)
    for (const file of patch_files) {
      await exec.exec('patch', [`--directory=${path}`, '--strip=1', `--input=${file}`])
    }

  return true
}

async function run(): Promise<void> {
  try {
    const wrkdir = core.getInput('wrkdir')
    await io.mkdirP(wrkdir)

    const upstreamClient = gitClient(wrkdir)
    let upstreamUri = core.getInput('upstream-uri')
    const upstreamToken = core.getInput('upstream-token')
    if (upstreamToken.length) {
      let parsedUri = uri.parse(upstreamUri)
      parsedUri.userinfo = upstreamToken
      upstreamUri = uri.serialize(parsedUri)
    }

    const downstreamClient = gitClient()
    const downstream_remote = await downstreamClient.getRemotes(true)
    let downstream_uri = downstream_remote[0].refs.fetch
    core.debug(`Downstream URI: ${downstream_uri}`)
    const downstream_token = core.getInput('token')
    if (downstream_token.length) {
      let parsedUri = uri.parse(downstream_uri)
      core.debug(JSON.stringify(parsedUri))
      parsedUri.userinfo = downstream_token
      downstream_uri = uri.serialize(parsedUri)
      await downstreamClient.removeRemote(downstream_remote[0].name)
      core.debug(`Adding remote ${downstream_remote[0].name}:${downstream_uri}`)
      await downstreamClient.addRemote(downstream_remote[0].name, downstream_uri)
    }

    await fetch(upstreamClient, upstreamUri, wrkdir)

    //const octokit = github.getOctokit('token')
    //octokit.rest.git.getCommit
    //
    const patches = core.getInput('patches')

    await patch(patches, wrkdir)
    await upstreamClient.add('.').commit('head').addTag('head')

    await upstreamClient.checkout('baseline')

    const pullRequestPayload = github.context.payload as webhooks.PullRequestEvent
    const base = pullRequestPayload.pull_request.base.ref
    const head = pullRequestPayload.pull_request.head.ref

    await downstreamClient.fetch('origin', base).checkout(base)
    await patch(patches, wrkdir)
    await upstreamClient.add('.').commit('base').addTag('base')

    await upstreamClient.diff(['base..head'])

  } catch (error) {
    if (error instanceof Error) core.setFailed(error.message)
  }
}

run()
