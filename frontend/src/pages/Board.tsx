import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '@/lib/api'
import { DragDropContext, Droppable, Draggable, DropResult } from '@hello-pangea/dnd'
import { useEffect, useMemo, useState } from 'react'

export default function Board() {
  const qc = useQueryClient()
  const { data } = useQuery({
    queryKey: ['board'],
    queryFn: async () => (await api.get('/boards/me')).data,
  })

  const [local, setLocal] = useState<any | null>(null)
  const [summary, setSummary] = useState<string>('')
  const [busy, setBusy] = useState<boolean>(false)
  const [showAddModal, setShowAddModal] = useState<boolean>(false)
  const [ideaText, setIdeaText] = useState<string>('')
  const [selectionMode, setSelectionMode] = useState<boolean>(false)
  const [selectedIds, setSelectedIds] = useState<Record<string, boolean>>({})
  const [folderName, setFolderName] = useState<string>('New Cluster')
  const [summarizeFolderId, setSummarizeFolderId] = useState<string>('')
  useEffect(()=>{ if (data) setLocal(data) }, [data])

  const reorderMutation = useMutation({
    mutationFn: (payload: any) => api.post(`/boards/${local._id}/reorder`, payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['board'] }),
  })

  const addCardMutation = useMutation({
    mutationFn: async (content: string) => {
      if (!local) return
      const firstCol = local.columns?.[0]
      return (await api.post(`/boards/${local._id}/cards`, { columnId: firstCol._id, content })).data
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['board'] }),
  })

  const clusterMutation = useMutation({
    mutationFn: async () => (await api.post(`/ai/boards/${local._id}/cluster`)).data,
  })

  const summarizeMutation = useMutation({
    mutationFn: async (folderId?: string) => (await api.post(`/ai/boards/${local._id}/summarize`, { folderId })).data,
    onSuccess: (data: any) => setSummary(data.summary || ''),
  })

  const folders = useMemo(()=> local?.folders || [], [local])
  const selectedList = useMemo(()=> Object.keys(selectedIds).filter(id => selectedIds[id]), [selectedIds])

  if (!local) return <div className="p-6">Loading...</div>

  const onDragEnd = (result: DropResult) => {
    const { destination, source, draggableId } = result
    if (!destination) return
    if (destination.droppableId === source.droppableId && destination.index === source.index) return
    // Optimistic UI would go here. For now, just call backend.
    reorderMutation.mutate({ draggableId, source, destination })
  }

  const toggleSelect = (cardId: string) => {
    setSelectedIds(prev => ({ ...prev, [cardId]: !prev[cardId] }))
  }

  const createFolderFromSelection = async () => {
    if (!local || selectedList.length === 0) return
    setBusy(true)
    try {
      const { data: cf } = await api.post(`/boards/${local._id}/folders`, { name: folderName })
      const folderId = cf.folder._id
      await api.post(`/boards/${local._id}/folders/${folderId}/assign`, { cardIds: selectedList })
      await qc.invalidateQueries({ queryKey: ['board'] })
      setSelectionMode(false)
      setSelectedIds({})
      setFolderName('New Cluster')
    } finally { setBusy(false) }
  }

  return (
    <div className="h-screen flex">
      <div className="w-64 bg-white border-r p-4 space-y-3">
        <button
          disabled={busy}
          onClick={()=>{ setIdeaText(''); setShowAddModal(true) }}
          className="w-full bg-blue-600 text-white rounded p-2 hover:bg-blue-700 disabled:opacity-50">
          Add Card
        </button>
        <div className="space-y-2 p-2 border rounded">
          <div className="flex items-center justify-between">
            <span className="font-medium">Cluster</span>
            <label className="text-sm flex items-center gap-2">
              <input type="checkbox" className="accent-emerald-600" checked={selectionMode} onChange={e=>{ setSelectionMode(e.target.checked); if(!e.target.checked) setSelectedIds({}) }} />
              Select
            </label>
          </div>
          <input className="w-full border rounded p-2 text-sm" placeholder="Folder name" value={folderName} onChange={e=>setFolderName(e.target.value)} />
          <button
            disabled={busy || selectedList.length===0}
            onClick={createFolderFromSelection}
            className="w-full bg-emerald-600 text-white rounded p-2 hover:bg-emerald-700 disabled:opacity-50">
            Create Folder from selection ({selectedList.length})
          </button>
        </div>
        <div className="space-y-2 p-2 border rounded">
          <div className="font-medium">Summarize</div>
          <select className="w-full border rounded p-2 text-sm" value={summarizeFolderId} onChange={e=>setSummarizeFolderId(e.target.value)}>
            <option value="">Select folder…</option>
            {folders.map((f:any)=> (
              <option key={f._id} value={f._id}>{f.name}</option>
            ))}
          </select>
          <button
            disabled={busy || !summarizeFolderId}
            onClick={async ()=>{ setBusy(true); try{ await summarizeMutation.mutateAsync(summarizeFolderId); } finally{ setBusy(false) } }}
            className="w-full bg-indigo-600 text-white rounded p-2 hover:bg-indigo-700 disabled:opacity-50">
            Summarize Folder
          </button>
        </div>
      </div>
      <div className="flex-1 overflow-auto p-4">
        <DragDropContext onDragEnd={onDragEnd}>
          <div className="grid grid-flow-col auto-cols-[320px] gap-4">
            {local.columns?.map((col: any, ci: number) => (
              <div key={col._id} className="bg-gray-100 rounded p-3">
                <h2 className="font-semibold mb-2">{col.title}</h2>
                <Droppable droppableId={col._id}>
                  {(provided) => (
                    <div ref={provided.innerRef} {...provided.droppableProps} className="space-y-2 min-h-[40px]">
                      {local.cards?.filter((c: any) => c.columnId === col._id).sort((a: any,b: any)=>a.position-b.position).map((card: any, i: number) => (
                        <Draggable key={card._id} draggableId={card._id} index={i}>
                          {(prov) => (
                            <div
                              ref={prov.innerRef}
                              {...prov.draggableProps}
                              {...prov.dragHandleProps}
                              className={`bg-white rounded shadow p-2 relative ${selectionMode && selectedIds[card._id] ? 'ring-2 ring-emerald-500' : ''}`}
                              onClick={()=>{ if(selectionMode){ toggleSelect(card._id) } }}
                            >
                              {selectionMode && (
                                <input type="checkbox" className="absolute top-2 right-2 accent-emerald-600" checked={!!selectedIds[card._id]} readOnly />
                              )}
                              <div className="text-sm whitespace-pre-wrap">{card.content}</div>
                              {card.folderId && (
                                <div className="text-[11px] text-gray-500 mt-1">Folder: {folders.find((f:any)=>f._id===card.folderId)?.name || card.folderId}</div>
                              )}
                            </div>
                          )}
                        </Draggable>
                      ))}
                      {provided.placeholder}
                    </div>
                  )}
                </Droppable>
              </div>
            ))}
          </div>
        </DragDropContext>
      </div>
      <div className="w-80 bg-white border-l p-4">
        <h3 className="font-semibold mb-2">AI Summary</h3>
        {summary ? (
          <p className="text-sm text-gray-800 whitespace-pre-wrap">{summary}</p>
        ) : (
          <p className="text-sm text-gray-600">No summary yet.</p>
        )}
      </div>

      {showAddModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white rounded shadow w-full max-w-md p-4 space-y-3">
            <h3 className="font-semibold">Add Idea</h3>
            <textarea
              className="w-full border rounded p-2 h-32"
              placeholder="Write your idea..."
              value={ideaText}
              onChange={e=>setIdeaText(e.target.value)}
            />
            <div className="flex gap-2 justify-end">
              <button className="px-3 py-2 rounded border" onClick={()=> setShowAddModal(false)}>Cancel</button>
              <button
                className="px-3 py-2 rounded bg-blue-600 text-white disabled:opacity-50"
                disabled={!ideaText.trim() || addCardMutation.isPending}
                onClick={async ()=>{ await addCardMutation.mutateAsync(ideaText.trim()); setShowAddModal(false); setIdeaText('') }}
              >{addCardMutation.isPending ? 'Adding...' : 'Add'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
