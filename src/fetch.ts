import * as io from '@actions/io'
import * as exec from '@actions/exec'
import * as URI from 'uri-js'
import * as path from 'path'
import * as os from 'os'

export interface FetchOptions {
  tmpDir?: string
}

export interface Fetcher {
  get tmpDir(): string

  fetch(dir: string): Promise<string>
}

export const DefaultFetchOptions = {
  tmpDir: os.tmpdir()
}

class HttpFetcher implements Fetcher {
  private parsedUri: URI.URIComponents
  private options: FetchOptions

  private outputName(): string {
    if (this.parsedUri.path) {
      return path.parse(this.parsedUri.path).base
    }
    return 'output'
  }

  private tmpFileName(): string {
    return path.join(this.tmpDir, this.outputName())
  }

  constructor(private readonly uri: string, options?: FetchOptions) {
    this.parsedUri = URI.parse(uri)
    this.options = {...DefaultFetchOptions, ...options} as FetchOptions
  }

  get tmpDir(): string {
    if (this.options && this.options.tmpDir) {
      return this.options.tmpDir
    }
    return DefaultFetchOptions.tmpDir
  }

  async download(): Promise<string> {
    const tmpFileName = this.tmpFileName()
    const exitCode = await exec.exec('curl', [
      '--location',
      '--fail',
      '--output',
      tmpFileName,
      this.uri
    ])

    if (exitCode) {
      throw new Error(`Failed to download from ${this.uri}: ${exitCode}`)
    }

    return tmpFileName
  }

  async extract(dir: string): Promise<string> {
    const tmpFileName = this.tmpFileName()

    const exitCode = await exec.exec(
      'tar',
      ['--extract', `--file=${tmpFileName}`, '--strip-components=1', '-C', dir],
      {ignoreReturnCode: true}
    )

    if (exitCode) {
      throw Error(`Failed to extract ${tmpFileName}: ${exitCode}`)
    }

    return dir
  }

  async fetch(dir: string): Promise<string> {
    await io.mkdirP(dir)
    const downloadPath = await this.download()

    try {
      return await this.extract(dir)
    } catch (e: unknown) {
      if (e instanceof Error && e.message.startsWith('Failed to extract')) {
        const outputPath = path.join(dir, this.outputName())
        if (outputPath !== downloadPath) {
          await io.mv(downloadPath, dir)
        }
        return outputPath
      }
      throw e
    }
  }
}

export function create(uri: string, options?: FetchOptions): Fetcher {
  const parts = uri.split(';')
  const parsedUri = URI.parse(parts[0])

  const scheme = parsedUri.scheme
  switch (scheme) {
    case 'http':
    case 'https': {
      return new HttpFetcher(uri, options)
    }
    default:
      throw new Error(`Unknown fetcher scheme: ${scheme}`)
  }
}
