import {exec} from '@actions/exec'
import {GlobOptions} from '@actions/glob'
import * as glob from '@actions/glob'

export interface PatchOptions {
  strip?: number
}

export const DefaultPatchOptions = {
  strip: 1
}

export class Patch {
  constructor(readonly file: string, readonly options?: PatchOptions) {}

  get strip(): number {
    if (this.options && this.options.strip) {
      return this.options.strip
    }
    return DefaultPatchOptions.strip
  }

  async apply(dir: string): Promise<number> {
    return exec('patch', [
      `--directory=${dir}`,
      `--strip=${this.strip}`,
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

  async patch(dir: string): Promise<void> {
    for (const p of this.patches) {
      if (await p.apply(dir)) {
        throw new Error(`Failed to apply ${p.file} in ${dir}`)
      }
    }
  }
}
