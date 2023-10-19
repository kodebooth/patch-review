import {expect, jest, describe, it} from '@jest/globals'
import * as patch from '../src/patch'
import * as exec from '@actions/exec'
import * as glob from '@actions/glob'
import {Globber} from '@actions/glob'

const workingDirectory = 'working-directory'
const patchFiles = ['file-name-2', 'file-name-1']
const globPattern = 'glob-pattern'
const patchFile = 'file-name'
const globberMock = {
  glob(): Promise<string[]> {
    return new Promise(resolve => resolve(patchFiles.slice()))
  }
}

describe('patch', () => {
  describe('construction', () => {
    it('should construct with only file name', () => {
      expect(new patch.Patch(patchFile)).toBeInstanceOf(patch.Patch)
    })

    it('should construct with default options', () => {
      expect(
        new patch.Patch(patchFile, patch.DefaultPatchOptions)
      ).toBeInstanceOf(patch.Patch)
    })
  })

  describe('application', () => {
    it('should apply', async () => {
      jest
        .spyOn(exec, 'exec')
        .mockReturnValue(new Promise(resolve => resolve(0)))

      expect(await new patch.Patch(patchFile).apply(workingDirectory)).toEqual(
        0
      )
      expect(jest.mocked(exec.exec)).toHaveBeenCalledTimes(1)
      expect(jest.mocked(exec.exec)).toHaveBeenCalledWith('patch', [
        `--directory=${workingDirectory}`,
        `--strip=${patch.DefaultPatchOptions.strip}`,
        `--input=${patchFile}`
      ])
    })

    it('should apply with added options', async () => {
      jest
        .spyOn(exec, 'exec')
        .mockReturnValue(new Promise(resolve => resolve(0)))

      const strip = 5

      expect(patch.DefaultPatchOptions.strip).not.toEqual(strip)
      expect(
        await new patch.Patch(patchFile, {strip: strip}).apply(workingDirectory)
      ).toEqual(0)
      expect(jest.mocked(exec.exec)).toHaveBeenCalledTimes(1)
      expect(jest.mocked(exec.exec)).toHaveBeenCalledWith('patch', [
        `--directory=${workingDirectory}`,
        `--strip=${strip}`,
        `--input=${patchFile}`
      ])
    })
  })
})

describe('manager', () => {
  describe('construction', () => {
    it('should construct', () => {
      expect(new patch.Manager()).toBeInstanceOf(patch.Manager)
    })
  })

  describe('adding patches', () => {
    it('should add single file', () => {
      const manager = new patch.Manager()
      manager.addPatch(patchFile)

      expect(manager.patches).toHaveLength(1)
    })

    it('should add many files', () => {
      const manager = new patch.Manager()
      manager.addPatch(patchFile)
      manager.addPatch(patchFile)

      expect(manager.patches).toHaveLength(2)
    })

    it('should add matching glob files', async () => {
      jest
        .spyOn(glob, 'create')
        .mockReturnValue(
          new Promise(resolve => resolve(globberMock as Globber))
        )

      const manager = new patch.Manager()
      await manager.addFromGlob(globPattern)

      patchFiles.sort()

      expect(jest.mocked(glob.create)).toBeCalled()
      expect(manager.patches).toHaveLength(patchFiles.length)
      manager.patches.forEach(
        (value: patch.Patch, index: number, _array: patch.Patch[]): void => {
          expect(value.file).toEqual(patchFiles[index])
        }
      )
    })
  })

  describe('applying patches', () => {
    it('should apply all patches', async () => {
      jest
        .spyOn(exec, 'exec')
        .mockReturnValue(new Promise(resolve => resolve(0)))

      jest
        .spyOn(glob, 'create')
        .mockReturnValue(
          new Promise(resolve => resolve(globberMock as Globber))
        )

      const manager = new patch.Manager()
      manager.addPatch(patchFile)
      manager.addFromGlob(globPattern)

      await manager.patch(workingDirectory)

      expect(jest.mocked(exec.exec)).toHaveBeenCalledTimes(3)
      manager.patches.forEach(
        (value: patch.Patch, _index: number, _array: patch.Patch[]): void => {
          expect(jest.mocked(exec.exec)).toHaveBeenCalledWith('patch', [
            `--directory=${workingDirectory}`,
            `--strip=${patch.DefaultPatchOptions.strip}`,
            `--input=${value.file}`
          ])
        }
      )
    })

    it('should throw error when failing to apply a patch', async () => {
      jest
        .spyOn(exec, 'exec')
        .mockReturnValue(new Promise(resolve => resolve(1)))

      const manager = new patch.Manager()
      manager.addPatch(patchFile)

      expect(async () => {
        await manager.patch(workingDirectory)
      }).rejects.toThrow(`Failed to apply ${patchFile} in ${workingDirectory}`)
    })
  })
})
