import {expect, jest, describe, it} from '@jest/globals'
import * as patch from '../src/patch'
import * as glob from 'glob'
import * as exec from '../src/exec'
import {Ok} from 'pratica'

const workingDirectory = 'working-directory'
const patchFiles = ['file-name-2', 'file-name-1']
const globPattern = ['glob-pattern']
const patchFile = 'file-name'

jest.mock('child_process')

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
        .spyOn(exec, 'execute')
        .mockReturnValue(new Promise(resolve => resolve(Ok())))
      const result = await new patch.Patch(patchFile).apply(workingDirectory)
      expect(result.isOk()).toBeTruthy()

      expect(jest.mocked(exec.execute)).toHaveBeenCalledTimes(1)
      expect(jest.mocked(exec.execute)).toHaveBeenCalledWith(
        `patch --directory=${workingDirectory} --strip=${patch.DefaultPatchOptions.strip} --input=${patchFile}`
      )
    })

    it('should apply with added options', async () => {
      jest
        .spyOn(exec, 'execute')
        .mockReturnValue(new Promise(resolve => resolve(Ok())))
      const strip = 5

      expect(patch.DefaultPatchOptions.strip).not.toEqual(strip)
      expect(
        await new patch.Patch(patchFile, {strip: strip}).apply(workingDirectory)
      )
      expect(jest.mocked(exec.execute)).toHaveBeenCalledTimes(1)
      expect(jest.mocked(exec.execute)).toHaveBeenCalledWith(
        `patch --directory=${workingDirectory} --strip=${strip} --input=${patchFile}`
      )
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
        .spyOn(glob, 'glob')
        .mockReturnValue(new Promise(resolve => resolve(patchFiles)))

      const manager = new patch.Manager()
      await manager.addFromGlob(globPattern)

      patchFiles.sort()

      expect(jest.mocked(glob.glob)).toBeCalled()
      expect(jest.mocked(glob.glob)).toBeCalledWith(globPattern)
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
        .spyOn(exec, 'execute')
        .mockReturnValue(new Promise(resolve => resolve(Ok())))

      jest
        .spyOn(glob, 'glob')
        .mockReturnValue(new Promise(resolve => resolve(patchFiles)))

      const manager = new patch.Manager()
      manager.addPatch(patchFile)
      await manager.addFromGlob(globPattern)

      await manager.patch(workingDirectory)

      expect(jest.mocked(exec.execute)).toHaveBeenCalledTimes(3)
      manager.patches.forEach(
        (value: patch.Patch, _index: number, _array: patch.Patch[]): void => {
          expect(jest.mocked(exec.execute)).toHaveBeenCalledWith(
            `patch --directory=${workingDirectory} --strip=${patch.DefaultPatchOptions.strip} --input=${value.file}`
          )
        }
      )
    })
  })
})
