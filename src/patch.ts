import {exec} from '@actions/exec'
import {GlobOptions} from '@actions/glob'
import * as glob from '@actions/glob'

export interface PatchOptions {
  strip?: number
}

export class Patch {
  static readonly defaultOptions: PatchOptions = {
    strip: 1
  }

  constructor(readonly file: string, private options?: PatchOptions) {
    this.options = {...Patch.defaultOptions, ...options}
  }

  async apply(wrkdir: string, options?: PatchOptions): Promise<number> {
    options = {...this.options, ...options}
    return exec('patch', [
      `--directory=${wrkdir}`,
      `--strip=${options.strip}`,
      `--input=${this.file}`
    ])
  }
}

export class Manager {
  readonly patches: Patch[] = []

  addPatch(file: string, options?: PatchOptions): void {
    this.patches.push(new Patch(file, options))
  }

  async addFromGlob(patterns: string, options?: GlobOptions): Promise<void> {
    const globber = await glob.create(patterns, options)
    const patches = await globber.glob()
    patches.sort()
    for (const patch of patches) {
      this.patches.push(new Patch(patch))
    }
  }

  async patch(wrkdir: string): Promise<void> {
    for (const p of this.patches) {
      if (await p.apply(wrkdir)) {
        throw new Error(`Failed to apply ${p.file} in ${wrkdir}`)
      }
    }
  }
}
