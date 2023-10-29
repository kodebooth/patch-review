import {Result, Ok, Err} from 'pratica'
import {exec} from 'child_process'

export async function execute(command: string): Promise<Result<void, string>> {
  return new Promise(resolve => {
    exec(command, (error, _, stderr) => {
      if (error === null) {
        resolve(Ok())
      } else {
        resolve(Err(stderr))
      }
    })
  })
}
