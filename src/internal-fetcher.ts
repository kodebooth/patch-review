import * as io from '@actions/io'
import * as exec from '@actions/exec'
import * as Uri from 'uri-js'
import * as path from 'path'
import * as git from 'simple-git'
import {AuthorizedUri} from './internal-authorized-uri'

interface Fetcher {
  fetch(wrkdir: string): Promise<void>
}

class FetcherHelper {
  static async ensure_parents_exist(wrkdir: string): Promise<void> {
    const dirname = path.dirname(wrkdir)
    return io.mkdirP(dirname)
  }
}

class FileFetcher implements Fetcher {
  authorizedUri: AuthorizedUri

  constructor(uri: AuthorizedUri) {
    this.authorizedUri = uri
  }

  async fetch(wrkdir: string): Promise<void> {
    const src = Uri.parse(this.authorizedUri.uri).host!

    await FetcherHelper.ensure_parents_exist(wrkdir)
    await io.cp(src, wrkdir, {recursive: true})
  }
}

class GitFetcher implements Fetcher {
  authorizedUri: AuthorizedUri
  depth = 1

  constructor(uri: AuthorizedUri) {
    this.authorizedUri = uri
  }

  async fetch(wrkdir: string): Promise<void> {
    await FetcherHelper.ensure_parents_exist(wrkdir)
    await git
      .simpleGit()
      .clone(this.authorizedUri.uri, wrkdir, {'--depth': this.depth})
    await io.rmRF(`${wrkdir}/.git`)
    await io.rmRF(`${wrkdir}/.gitignore`)
  }
}

class HttpFetcher implements Fetcher {
  authorizedUri: AuthorizedUri

  constructor(uri: AuthorizedUri) {
    this.authorizedUri = uri
  }

  async do_fetch(wrkdir: string): Promise<void> {
    const parsedUri = Uri.parse(this.authorizedUri.uri)
    const parsedPath = path.parse(parsedUri.path!)

    await exec.exec('curl', [
      '--location',
      '--fail',
      '--output',
      parsedPath.base,
      this.authorizedUri.uri
    ])
    await io.mkdirP(wrkdir)
    await exec.exec('tar', [
      '--extract',
      `--file=${parsedPath.base}`,
      '--strip-components=1',
      '-C',
      wrkdir
    ])
  }

  async fetch(wrkdir: string): Promise<void> {
    await FetcherHelper.ensure_parents_exist(wrkdir)
    await this.do_fetch(wrkdir)
  }
}

export class FetcherFactory {
  static create(uri: AuthorizedUri): Fetcher {
    const scheme = Uri.parse(uri.uri).scheme
    switch (scheme) {
      case 'file': {
        return new FileFetcher(uri)
      }
      case 'git': {
        return new GitFetcher(uri)
      }
      case 'http':
      case 'https': {
        return new HttpFetcher(uri)
      }
      default:
        throw new Error(`Unknown fetcher scheme ${scheme}`)
    }
  }
}
