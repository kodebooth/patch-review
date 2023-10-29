import {execute} from './exec'
import {glob} from 'glob'
import {Result, Ok} from 'pratica'

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

  async apply(dir: string): Promise<Result<void, string>> {
    return execute(
      `patch --directory=${dir} --strip=${this.strip} --input=${this.file}`
    )
  }
}

export class Manager {
  readonly patches: Patch[] = []

  addPatch(file: string, options?: PatchOptions): void {
    this.patches.push(new Patch(file, options))
  }

  async addFromGlob(patterns: string | string[]): Promise<void> {
    const patches = await glob(patterns)
    patches.sort()
    for (const patch of patches) {
      this.patches.push(new Patch(patch))
    }
  }

  async patch(dir: string): Promise<Result<void, string>> {
    for (const p of this.patches) {
      const result = await p.apply(dir)
      if (result.isErr()) {
        return result
      }
    }
    return Ok()
  }
}
