import * as io from '@actions/io'
import {exec} from 'child_process'
import * as URI from 'uri-js'
import * as path from 'path'
import * as os from 'os'
import {Ok, Err, Result} from 'pratica'

export interface FetchOptions {
  tmpDir?: string
}

export interface Fetcher {
  get tmpDir(): string

  fetch(dir: string): Promise<Result<string, string>>
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

  async download(): Promise<Result<string, string>> {
    const tmpFileName = this.tmpFileName()

    return new Promise(resolve => {
      exec(
        `curl --location --fail --output ${tmpFileName} ${this.uri}`,
        (error, _, stderr) => {
          if (error === null) {
            resolve(Ok(tmpFileName))
          } else {
            resolve(Err(stderr))
          }
        }
      )
    })
  }

  async extract(dir: string): Promise<Result<string, string>> {
    const tmpFileName = this.tmpFileName()

    return new Promise(resolve => {
      exec(
        `tar --extract --file=${tmpFileName} --strip-components=1 -C ${dir}`,
        (error, _, stderr) => {
          if (error === null) {
            resolve(Ok(dir))
          } else {
            resolve(Err(stderr))
          }
        }
      )
    })
  }

  async fetch(dir: string): Promise<Result<string, string>> {
    try {
      await io.mkdirP(dir)
    } catch (e) {
      return Err((e as Error).toString())
    }

    const downloadPath = await this.download()
    if (downloadPath.isErr()) {
      return downloadPath
    }

    const extractResult = await this.extract(dir)
    if (extractResult.isOk()) {
      return extractResult
    }

    const outputPath = path.join(dir, this.outputName())
    if (outputPath !== downloadPath.value()) {
      try {
        await io.mv(downloadPath.value(), dir)
      } catch (e) {
        return Err((e as Error).toString())
      }
    }

    return Ok(outputPath)
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
