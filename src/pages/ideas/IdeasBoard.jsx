// src/pages/ideas/IdeasBoard.jsx
import { useState, useEffect, useCallback } from 'react'
import { Plus, Settings } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { getIdeas, getIdeaCategories, createIdea, updateIdea, deleteIdea, convertIdeaToTask } from '../../lib/ideas-supabase'
import { createTask } from '../../lib/supabase'
import KanbanColumn from '../../components/ideas/KanbanColumn'
import IdeaQuickCapture from '../../components/ideas/IdeaQuickCapture'
import IdeaDetail from '../../components/ideas/IdeaDetail'
import Layout from '../../components/Layout'
import toast from 'react-hot-toast'

const STATUSES = ['raw', 'exploring', 'in_progress', 'shelved', 'done', 'discarded']

export default function IdeasBoard() {
  const { profile } = useAuth()
  const isOwner = profile?.role === 'owner'

  const [ideas, setIdeas]             = useState([])
  const [categories, setCategories]   = useState([])
  const [loading, setLoading]         = useState(true)
  const [filterCategory, setFilterCategory] = useState('')
  const [viewAll, setViewAll]         = useState(true) // owner toggle
  const [showCapture, setShowCapture] = useState(false)
  const [captureStatus, setCaptureStatus] = useState('raw')
  const [selectedIdea, setSelectedIdea] = useState(null)
  const [convertTarget, setConvertTarget] = useState(null)
  const [taskTitle, setTaskTitle]     = useState('')
  const [taskNotes, setTaskNotes]     = useState('')
  const [savingTask, setSavingTask]   = useState(false)

  const load = useCallback(async () => {
    try {
      const [ideasData, catsData] = await Promise.all([getIdeas(), getIdeaCategories()])
      setIdeas(ideasData)
      setCategories(catsData)
    } catch (err) {
      toast.error(err.message || 'Failed to load')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const filteredIdeas = ideas.filter(i => {
    if (filterCategory && i.category_id !== filterCategory) return false
    if (!isOwner || !viewAll) {
      if (i.submitted_by !== profile?.id) return false
    }
    return true
  })

  const ideasByStatus = (status) => filteredIdeas.filter(i => i.status === status)

  const handleCreate = async (fields) => {
    const newIdea = await createIdea({ ...fields, submitted_by: profile.id })
    setIdeas(prev => [newIdea, ...prev])
    toast.success('Idea saved')
  }

  const handleUpdate = async (id, fields) => {
    // attachment_count is a computed field (not a DB column); handle it locally only
    if ('attachment_count' in fields) {
      const { attachment_count, ...dbFields } = fields
      setIdeas(prev => prev.map(i => i.id === id ? { ...i, attachment_count } : i))
      if (selectedIdea?.id === id) setSelectedIdea(prev => ({ ...prev, attachment_count }))
      if (Object.keys(dbFields).length === 0) return
      const updated = await updateIdea(id, dbFields)
      setIdeas(prev => prev.map(i => i.id === id ? { ...updated, attachment_count } : i))
      if (selectedIdea?.id === id) setSelectedIdea({ ...updated, attachment_count })
      return
    }
    const updated = await updateIdea(id, fields)
    setIdeas(prev => prev.map(i => i.id === id ? updated : i))
    if (selectedIdea?.id === id) setSelectedIdea(updated)
  }

  const handleDelete = async (id) => {
    await deleteIdea(id)
    setIdeas(prev => prev.filter(i => i.id !== id))
    toast.success('Idea deleted')
  }

  const handleConvertToTask = (idea) => {
    setConvertTarget(idea)
    setTaskTitle(idea.title)
    setTaskNotes(idea.notes || '')
  }

  const handleConfirmConvert = async () => {
    if (!taskTitle.trim() || !convertTarget) return
    setSavingTask(true)
    try {
      const task = await createTask({
        title: taskTitle.trim(),
        description: taskNotes.trim() || null,
        created_by: profile.id,
      })
      const updated = await convertIdeaToTask(convertTarget.id, task.id)
      setIdeas(prev => prev.map(i => i.id === convertTarget.id ? updated : i))
      if (selectedIdea?.id === convertTarget.id) setSelectedIdea(updated)
      setConvertTarget(null)
      toast.success('Task created from idea')
    } catch (err) {
      toast.error(err.message || 'Failed to create task')
    } finally {
      setSavingTask(false)
    }
  }

  if (loading) return <Layout><p className="text-noch-muted text-center py-16">Loading...</p></Layout>

  return (
    <Layout>
      {/* Header */}
      <div className="flex items-center justify-between mb-6 shrink-0">
        <div>
          <h1 className="text-white font-bold text-xl">Ideas</h1>
          <p className="text-noch-muted text-sm">{filteredIdeas.length} idea{filteredIdeas.length !== 1 ? 's' : ''}</p>
        </div>
        <div className="flex items-center gap-2">
          {isOwner && (
            <Link to="/ideas/categories" className="btn-secondary flex items-center gap-2 text-sm px-3 py-2">
              <Settings size={14} />
              Categories
            </Link>
          )}
          <button
            onClick={() => { setCaptureStatus('raw'); setShowCapture(true) }}
            className="btn-primary flex items-center gap-2 text-sm px-4 py-2"
          >
            <Plus size={14} />
            New Idea
          </button>
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex items-center gap-3 mb-6 shrink-0">
        <select
          value={filterCategory}
          onChange={e => setFilterCategory(e.target.value)}
          className="input py-1.5 px-3 text-sm w-48"
        >
          <option value="">All Categories</option>
          {categories.map(c => (
            <option key={c.id} value={c.id}>{c.icon} {c.name}</option>
          ))}
        </select>

        {isOwner && (
          <div className="flex rounded-lg border border-noch-border overflow-hidden text-sm">
            <button
              onClick={() => setViewAll(true)}
              className={`px-3 py-1.5 transition-colors ${viewAll ? 'bg-noch-green text-noch-dark font-semibold' : 'text-noch-muted hover:text-white'}`}
            >
              All Ideas
            </button>
            <button
              onClick={() => setViewAll(false)}
              className={`px-3 py-1.5 transition-colors ${!viewAll ? 'bg-noch-green text-noch-dark font-semibold' : 'text-noch-muted hover:text-white'}`}
            >
              My Ideas
            </button>
          </div>
        )}
      </div>

      {/* Kanban board */}
      <div className="flex gap-4 overflow-x-auto pb-6 flex-1">
        {STATUSES.map(status => (
          <KanbanColumn
            key={status}
            status={status}
            ideas={ideasByStatus(status)}
            isOwner={isOwner}
            onAddClick={(s) => { setCaptureStatus(s); setShowCapture(true) }}
            onCardClick={setSelectedIdea}
            onConvertToTask={handleConvertToTask}
          />
        ))}
      </div>

      {/* Quick capture modal */}
      {showCapture && (
        <IdeaQuickCapture
          categories={categories}
          defaultStatus={captureStatus}
          onSave={handleCreate}
          onClose={() => setShowCapture(false)}
        />
      )}

      {/* Idea detail panel */}
      {selectedIdea && (
        <IdeaDetail
          idea={selectedIdea}
          categories={categories}
          isOwner={isOwner}
          currentUserId={profile?.id}
          onUpdate={handleUpdate}
          onDelete={handleDelete}
          onConvertToTask={handleConvertToTask}
          onClose={() => setSelectedIdea(null)}
        />
      )}

      {/* Convert to task modal */}
      {convertTarget && (
        <div className="fixed inset-0 z-[60] bg-black/70 flex items-center justify-center p-4">
          <div className="bg-noch-card border border-noch-border rounded-2xl w-full max-w-md p-6">
            <h3 className="text-white font-bold text-lg mb-1">Convert to Task</h3>
            <p className="text-noch-muted text-sm mb-5">Fill in the task details — idea will be marked as In Progress.</p>
            <div className="flex flex-col gap-4">
              <div>
                <label className="label block mb-1">Task Title *</label>
                <input
                  autoFocus
                  value={taskTitle}
                  onChange={e => setTaskTitle(e.target.value)}
                  className="input w-full"
                />
              </div>
              <div>
                <label className="label block mb-1">Description</label>
                <textarea
                  value={taskNotes}
                  onChange={e => setTaskNotes(e.target.value)}
                  rows={3}
                  className="input w-full resize-none"
                />
              </div>
              <p className="text-noch-muted text-xs">You can set assignee, due date, and priority after the task is created.</p>
              <div className="flex gap-3">
                <button onClick={() => setConvertTarget(null)} className="btn-secondary flex-1">Cancel</button>
                <button
                  onClick={handleConfirmConvert}
                  disabled={!taskTitle.trim() || savingTask}
                  className="btn-primary flex-1"
                >
                  {savingTask ? 'Creating...' : 'Create Task'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </Layout>
  )
}
