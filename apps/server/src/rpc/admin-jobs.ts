import type { JobQueueId, TaskId } from "@matinee/contracts"

import { allQueues, queueById } from "../jobs/queue"
import { allTasks, cancelTask, runTask, taskStatus } from "../jobs/scheduler"
import { saveConcurrency } from "../jobs/settings"
import { log } from "../log"
import { admin, badRequest, notFound } from "./base"

function queueOf(id: JobQueueId) {
  const queue = queueById(id)
  if (!queue) throw notFound("There's no such queue.")
  return queue
}

function taskOf(id: TaskId) {
  const task = taskStatus(id)
  if (!task) throw notFound("There's no such task.")
  return task
}

/** "1 job" or "3 jobs", as the concurrency messages say it. */
function jobCount(count: number) {
  return count === 1 ? "1 job" : `${count} jobs`
}

function overview() {
  return {
    queues: allQueues().map((queue) => queue.status()),
    tasks: allTasks(),
  }
}

export const adminJobs = {
  get: admin.admin.jobs.get.handler(() => overview()),

  pause: admin.admin.jobs.pause.handler(({ context, input }) => {
    const queue = queueOf(input.queue)
    queue.pause()
    log.info(`Queue ${input.queue} paused by ${context.user.username}`)
    return queue.status()
  }),

  resume: admin.admin.jobs.resume.handler(({ context, input }) => {
    const queue = queueOf(input.queue)
    queue.resume()
    log.info(`Queue ${input.queue} resumed by ${context.user.username}`)
    return queue.status()
  }),

  clear: admin.admin.jobs.clear.handler(({ context, input }) => {
    const queue = queueOf(input.queue)
    queue.clear()
    log.info(`Queue ${input.queue} cleared by ${context.user.username}`)
    return queue.status()
  }),

  updateConcurrency: admin.admin.jobs.updateConcurrency.handler(
    async ({ context, input }) => {
      // Check everything before changing anything.
      for (const queue of allQueues()) {
        const value = input.concurrency[queue.id]
        if (value === undefined || value === queue.status().concurrency) {
          continue
        }
        const { name } = queue.status()
        if (queue.maxConcurrency === null) {
          throw badRequest(
            `${name} always runs ${jobCount(queue.defaultConcurrency)} at once.`,
          )
        }
        if (value > queue.maxConcurrency) {
          throw badRequest(
            `${name} runs at most ${jobCount(queue.maxConcurrency)} at once.`,
          )
        }
      }
      await saveConcurrency(input.concurrency)
      log.info(`Job concurrency saved by ${context.user.username}`)
      return overview()
    },
  ),

  runTask: admin.admin.jobs.runTask.handler(({ context, input }) => {
    taskOf(input.task)
    log.info(`Task ${input.task} started by ${context.user.username}`)
    void runTask(input.task)
    return taskOf(input.task)
  }),

  cancelTask: admin.admin.jobs.cancelTask.handler(({ context, input }) => {
    taskOf(input.task)
    cancelTask(input.task)
    log.info(`Task ${input.task} cancelled by ${context.user.username}`)
    return taskOf(input.task)
  }),
}
