import * as glob from '@actions/glob'
import * as core from '@actions/core'
import * as exec from '@actions/exec'

export interface Patcher {
  patch(wrkdir: string): Promise<void>
}

class PatchFilePatcher implements Patcher {
  patterns: string
  globOptions: object
  strip = 1

  constructor(patterns: string) {
    this.patterns = patterns
    this.globOptions = {
      followSymbolicLinks:
        core.getInput('follow-symbolic-links').toUpperCase() !== 'FALSE'
    }
  }

  async patch(wrkdir: string): Promise<void> {
    const globber = await glob.create(this.patterns, this.globOptions)
    const files = await globber.glob()
    files.sort()
    for (const file of files) {
      await exec.exec('patch', [
        `--directory=${wrkdir}`,
        `--strip=${this.strip}`,
        `--input=${file}`
      ])
    }
  }
}

export class PatcherFactory {
  static create(patterns: string): Patcher {
    return new PatchFilePatcher(patterns)
  }
}
