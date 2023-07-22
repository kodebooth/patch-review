import {SimpleGit, simpleGit} from 'simple-git'
import {AuthorizedUri} from './internal-authorized-uri'
import * as io from '@actions/io'
import * as exec from '@actions/exec'
import * as core from '@actions/core'

export class GitClient {
  authorizedUri: AuthorizedUri | undefined
  gitClient: SimpleGit
  remote = 'origin'
  wrkdir: string
  prefix: string
  inited = false

  constructor(wrkdir: string, prefix: string, uri?: AuthorizedUri) {
    this.authorizedUri = uri
    this.wrkdir = wrkdir
    this.prefix = prefix
    this.gitClient = simpleGit(this.wrkdir)
  }

  private async init(): Promise<void> {
    if (this.inited) return

    await io.mkdirP(this.wrkdir)
    await this.gitClient
      .init()
      .addConfig('user.name', 'patch-review[bot]')
      .addConfig('user.email', 'patch-review[bot]')

    if (typeof this.authorizedUri !== 'undefined') {
      try {
        this.gitClient.addRemote(this.remote, this.authorizedUri.uri)
      } catch (error) {
        core.error(JSON.stringify(error))
      }
    }

    this.inited = true
  }

  addPrefix(ref: string): string {
    return `${this.prefix}-${ref}`
  }

  async mark(tag: string): Promise<void> {
    await this.init()

    tag = this.addPrefix(tag)
    const options = {
      cwd: this.wrkdir
    }
    await exec.exec('git', ['add', '--force', '.'], options)
    await this.gitClient.commit(tag).addTag(tag)
  }

  async checkout(tag: string): Promise<void> {
    await this.init()

    await this.checkoutHasPrefix(this.addPrefix(tag))
  }

  async checkoutHasPrefix(tag: string): Promise<void> {
    await this.init()

    try {
      await this.gitClient.fetch(tag)
    } catch (error) {
      core.error(JSON.stringify(error))
    }

    await this.gitClient.checkout(tag, ['--force'])
  }

  async push(tag: string): Promise<void> {
    await this.init()

    tag = this.addPrefix(tag)
    await this.gitClient.push(this.remote, `${tag}:refs/heads/${tag}`, [
      '--force'
    ])
  }

  async diff(base: string, head: string, output: string): Promise<void> {
    await this.init()

    base = this.addPrefix(base)
    head = this.addPrefix(head)

    await this.gitClient.diff([`${base}..${head}`, `--output=${output}`])
  }

  async revparse(ref: string): Promise<string> {
    await this.init()

    return this.gitClient.revparse(this.addPrefix(ref))
  }
}
