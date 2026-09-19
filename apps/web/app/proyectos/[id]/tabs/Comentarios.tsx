"use client"

import type { ProjectCommentFeedItem } from "../../../../lib/projects"
import { formatDateTime, initials } from "../../../../lib/format"

/** Fase E — "Comentarios": feed agregado de los comentarios de todas las tareas del proyecto (GET /projects/:id/comments, agregado nuevo). */
export function Comentarios({ comments, onOpenTask }: { comments: ProjectCommentFeedItem[]; onOpenTask: (taskId: string) => void }) {
  return (
    <div className="max-w-3xl space-y-3">
      {comments.map((c) => (
        <div key={c.id} className="rounded-2xl border border-white/10 bg-white/5 p-4">
          <div className="mb-1 flex items-center gap-2">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-yellow/80 text-[9px] font-bold text-purple-deep">
              {initials(c.user.name)}
            </span>
            <p className="text-xs text-cream/60">
              <span className="font-medium text-cream/90">{c.user.name}</span> · {formatDateTime(c.createdAt)}
            </p>
          </div>
          <p className="mb-2 text-sm text-cream/90">{c.body}</p>
          <button onClick={() => onOpenTask(c.task.id)} className="text-xs text-yellow hover:underline">
            Ver tarea: {c.task.title}
          </button>
        </div>
      ))}
      {comments.length === 0 && <p className="text-sm text-cream/50">Todavía no hay comentarios en ninguna tarea.</p>}
    </div>
  )
}
