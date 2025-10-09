import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '@/lib/api'
import { DragDropContext, Droppable, Draggable, DropResult } from '@hello-pangea/dnd'
import { useEffect, useMemo, useState } from 'react'
import { logout as doLogout } from '@/lib/auth'
import { useNavigate } from 'react-router-dom'

export default function Board() {
  const qc = useQueryClient()
  const nav = useNavigate()
  const { data } = useQuery({
    queryKey: ['board'],
    queryFn: async () => (await api.get('/boards/me')).data,
  })

  const [local, setLocal] = useState<any | null>(null)
  const [summary, setSummary] = useState<string>('')
  const [busy, setBusy] = useState<boolean>(false)
  const [showAddModal, setShowAddModal] = useState<boolean>(false)
  const [ideaText, setIdeaText] = useState<string>('')
  const [activeTab, setActiveTab] = useState<'ideas'|'clusters'|'summarize'>('ideas')
  const [selectionMode, setSelectionMode] = useState<boolean>(false)
  const [selectedIds, setSelectedIds] = useState<Record<string, boolean>>({})
  const [folderName, setFolderName] = useState<string>('New Cluster')
  const [summarizeFolderId, setSummarizeFolderId] = useState<string>('')
  const [editingClusterId, setEditingClusterId] = useState<string>('')
  const [editingClusterName, setEditingClusterName] = useState<string>('')
  const [showEditCardModal, setShowEditCardModal] = useState<boolean>(false)
  const [editingCardId, setEditingCardId] = useState<string>('')
  const [editingCardText, setEditingCardText] = useState<string>('')
  useEffect(()=>{ if (data) setLocal(data) }, [data])

  const handleLogout = () => {
    doLogout()
    qc.clear()
    nav('/login', { replace: true })
  }

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

  const assignToFolderMutation = useMutation({
    mutationFn: async ({ cardId, folderId }: { cardId: string; folderId: string }) =>
      (await api.post(`/boards/${local._id}/folders/${folderId}/assign`, { cardIds: [cardId] })).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['board'] }),
  })

  const createFolderMutation = useMutation({
    mutationFn: async (name: string) => (await api.post(`/boards/${local._id}/folders`, { name })).data,
    onSuccess: async () => {
      setFolderName('')
      await qc.invalidateQueries({ queryKey: ['board'] })
    },
  })

  const updateFolderMutation = useMutation({
    mutationFn: async ({ folderId, name }: { folderId: string; name: string }) =>
      (await api.patch(`/boards/${local._id}/folders/${folderId}`, { name })).data,
    onSuccess: async () => {
      setEditingClusterId('')
      setEditingClusterName('')
      await qc.invalidateQueries({ queryKey: ['board'] })
    },
  })

  const deleteFolderMutation = useMutation({
    mutationFn: async (folderId: string) => (await api.delete(`/boards/${local._id}/folders/${folderId}`)).data,
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['board'] })
    },
  })

  const updateCardMutation = useMutation({
    mutationFn: async ({ cardId, content, folderId }: { cardId: string; content?: string; folderId?: string | null }) => {
      const body: any = {}
      if (content !== undefined) body.content = content
      if (folderId !== undefined) body.folderId = folderId
      return (await api.patch(`/boards/${local._id}/cards/${cardId}`, body)).data
    },
    onSuccess: async () => {
      setShowEditCardModal(false)
      setEditingCardId('')
      setEditingCardText('')
      await qc.invalidateQueries({ queryKey: ['board'] })
    },
  })

  const deleteCardMutation = useMutation({
    mutationFn: async (cardId: string) => (await api.delete(`/boards/${local._id}/cards/${cardId}`)).data,
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['board'] })
    },
  })

  const folders = useMemo(()=> local?.folders || [], [local])
  const selectedList = useMemo(()=> Object.keys(selectedIds).filter(id => selectedIds[id]), [selectedIds])

  if (!local) return <div className="p-6">Loading...</div>

  const onDragEnd = (result: DropResult) => {
    const { destination, source, draggableId } = result
    if (!destination) return
    if (destination.droppableId === source.droppableId && destination.index === source.index) return
    // Drop into a folder (cluster) from Ideas chips
    if (destination.droppableId.startsWith('folder:')) {
      const folderId = destination.droppableId.split(':')[1]
      assignToFolderMutation.mutate({ cardId: draggableId, folderId })
      return
    }
    // Move within Clusters tab between clusters
    if (destination.droppableId.startsWith('cluster:')) {
      const folderId = destination.droppableId.split(':')[1]
      assignToFolderMutation.mutate({ cardId: draggableId, folderId })
      return
    }
    // Reorder within the Ideas column
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
      {/* Left Sidebar */}
      <aside className="w-60 bg-white border-r p-4 space-y-2">
        <div className="text-xs uppercase text-gray-500 px-2">Sections</div>
        <button
          className={`w-full text-left px-3 py-2 rounded ${activeTab==='ideas' ? 'bg-blue-50 text-blue-700' : 'hover:bg-gray-50'}`}
          onClick={()=>setActiveTab('ideas')}
        >Ideas</button>
        <button
          className={`w-full text-left px-3 py-2 rounded ${activeTab==='clusters' ? 'bg-blue-50 text-blue-700' : 'hover:bg-gray-50'}`}
          onClick={()=>setActiveTab('clusters')}
        >Clusters</button>
        <button
          className={`w-full text-left px-3 py-2 rounded ${activeTab==='summarize' ? 'bg-blue-50 text-blue-700' : 'hover:bg-gray-50'}`}
          onClick={()=>setActiveTab('summarize')}
        >Summarize</button>
        <div className="pt-3 border-t mt-3" />
        <button
          className="w-full text-left px-3 py-2 rounded border text-red-600 hover:bg-red-50"
          onClick={handleLogout}
        >Logout</button>
      </aside>

      {/* Right Content */}
      <div className="flex-1 overflow-auto p-4">
        {activeTab === 'ideas' && (
          <DragDropContext onDragEnd={onDragEnd}>
            <div className="flex items-center justify-between mb-4">
              <button
                disabled={busy}
                onClick={()=>{ setIdeaText(''); setShowAddModal(true) }}
                className="bg-blue-600 text-white rounded px-4 py-2 hover:bg-blue-700 disabled:opacity-50">
                Add Idea
              </button>
              {/* Visible clusters panel as droppables */}
              <div className="flex items-center gap-2 overflow-x-auto">
                {folders.length === 0 && (
                  <div className="text-sm text-gray-500">No clusters yet</div>
                )}
                {folders.map((f:any) => (
                  <Droppable key={f._id} droppableId={`folder:${f._id}`}>
                    {(prov) => (
                      <div ref={prov.innerRef} {...prov.droppableProps} className="px-3 py-2 rounded border bg-white shadow-sm flex items-center gap-2" style={{ minHeight: 40 }}>
                        <div className="w-2 h-2 rounded-full" style={{ backgroundColor: f.color || '#8b5cf6' }} />
                        <div className="text-sm">{f.name}</div>
                        {prov.placeholder}
                      </div>
                    )}
                  </Droppable>
                ))}
              </div>
            </div>

            {/* Ideas list */}
            {local.columns?.filter((c:any)=>c._id === 'col_ideas').map((col:any) => (
              <div key={col._id} className="bg-gray-50 rounded p-3">
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
                              className={`bg-white rounded shadow p-3 relative ${selectionMode && selectedIds[card._id] ? 'ring-2 ring-emerald-500' : ''}`}
                              onClick={()=>{
                                if (selectionMode) {
                                  toggleSelect(card._id)
                                } else {
                                  setEditingCardId(card._id)
                                  setEditingCardText(card.content)
                                  setShowEditCardModal(true)
                                }
                              }}
                            >
                              <div className="text-sm whitespace-pre-wrap">{card.content}</div>
                              {card.folderId && (
                                <div className="text-[11px] text-gray-500 mt-1">Cluster: {folders.find((f:any)=>f._id===card.folderId)?.name || card.folderId}</div>
                              )}
                              <div className="absolute top-2 right-2 flex gap-1">
                                <button className="text-xs px-2 py-1 rounded border bg-white hover:bg-red-50 text-red-600" onClick={(e)=>{ e.stopPropagation(); deleteCardMutation.mutate(card._id) }}>Delete</button>
                              </div>
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
          </DragDropContext>
        )}

        {activeTab === 'clusters' && (
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <input
                className="border rounded p-2 text-sm flex-1"
                placeholder="New cluster name"
                value={folderName}
                onChange={e=>setFolderName(e.target.value)}
              />
              <button
                disabled={!folderName.trim() || createFolderMutation.isPending}
                onClick={()=> createFolderMutation.mutate(folderName.trim())}
                className="px-3 py-2 rounded bg-emerald-600 text-white disabled:opacity-50"
              >{createFolderMutation.isPending ? 'Creating...' : 'Create'}</button>
            </div>
            <DragDropContext onDragEnd={onDragEnd}>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {folders.map((f:any)=>{
                  const clusterCards = (local.cards||[]).filter((c:any)=>c.folderId===f._id)
                  return (
                    <Droppable key={f._id} droppableId={`cluster:${f._id}`}>
                      {(provided) => (
                        <div ref={provided.innerRef} {...provided.droppableProps} className="border rounded p-3 bg-white min-h-[120px]">
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-2">
                              <div className="w-3 h-3 rounded-full" style={{ backgroundColor: f.color || '#8b5cf6' }} />
                              {editingClusterId === f._id ? (
                                <input className="border rounded px-2 py-1 text-sm" value={editingClusterName} onChange={(e)=>setEditingClusterName(e.target.value)} />
                              ) : (
                                <div className="font-medium">{f.name}</div>
                              )}
                            </div>
                            <div className="flex items-center gap-2">
                              <div className="text-xs text-gray-500">{clusterCards.length} ideas</div>
                              {editingClusterId === f._id ? (
                                <>
                                  <button className="text-xs px-2 py-1 rounded border bg-white hover:bg-gray-50" onClick={()=> updateFolderMutation.mutate({ folderId: f._id, name: editingClusterName || f.name })}>Save</button>
                                  <button className="text-xs px-2 py-1 rounded border bg-white hover:bg-gray-50" onClick={()=>{ setEditingClusterId(''); setEditingClusterName('') }}>Cancel</button>
                                </>
                              ) : (
                                <>
                                  <button className="text-xs px-2 py-1 rounded border bg-white hover:bg-gray-50" onClick={()=>{ setEditingClusterId(f._id); setEditingClusterName(f.name) }}>Edit</button>
                                  <button className="text-xs px-2 py-1 rounded border bg-white hover:bg-red-50 text-red-600" onClick={()=> deleteFolderMutation.mutate(f._id)}>Delete</button>
                                </>
                              )}
                            </div>
                          </div>
                          <div className="space-y-2">
                            {clusterCards.map((card:any, i:number) => (
                              <Draggable key={card._id} draggableId={card._id} index={i}>
                                {(prov) => (
                                  <div
                                    ref={prov.innerRef}
                                    {...prov.draggableProps}
                                    {...prov.dragHandleProps}
                                    className="bg-white rounded shadow p-2 border"
                                  >
                                    <div className="text-sm whitespace-pre-wrap">{card.content}</div>
                                    <div className="mt-1 flex gap-2">
                                      {/* In clusters: only remove from cluster (do not delete) */}
                                      <button className="text-xs px-2 py-1 rounded border bg-white hover:bg-gray-50" onClick={()=> updateCardMutation.mutate({ cardId: card._id, folderId: null })}>Remove</button>
                                    </div>
                                  </div>
                                )}
                              </Draggable>
                            ))}
                            {provided.placeholder}
                          </div>
                        </div>
                      )}
                    </Droppable>
                  )
                })}
                {folders.length===0 && (
                  <div className="text-sm text-gray-500">No clusters yet</div>
                )}
              </div>
            </DragDropContext>
          </div>
        )}

        {activeTab === 'summarize' && (
          <div className="space-y-3">
            <div className="flex gap-2">
              <select className="flex-1 border rounded p-2 text-sm" value={summarizeFolderId} onChange={e=>setSummarizeFolderId(e.target.value)}>
                <option value="">Select cluster…</option>
                {folders.map((f:any)=> (
                  <option key={f._id} value={f._id}>{f.name}</option>
                ))}
              </select>
              <button
                disabled={busy || !summarizeFolderId}
                onClick={async ()=>{ setBusy(true); try{ await summarizeMutation.mutateAsync(summarizeFolderId); } finally{ setBusy(false) } }}
                className="px-3 py-2 rounded bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50">
                Summarize
              </button>
            </div>
            {summary ? (
              <p className="text-sm text-gray-800 whitespace-pre-wrap">{summary}</p>
            ) : (
              <p className="text-sm text-gray-600">No summary yet.</p>
            )}
          </div>
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

      {showEditCardModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white rounded shadow w-full max-w-md p-4 space-y-3">
            <h3 className="font-semibold">Edit Idea</h3>
            <textarea
              className="w-full border rounded p-2 h-32"
              placeholder="Update your idea..."
              value={editingCardText}
              onChange={e=>setEditingCardText(e.target.value)}
            />
            <div className="flex gap-2 justify-end">
              <button className="px-3 py-2 rounded border" onClick={()=> { setShowEditCardModal(false); setEditingCardId(''); setEditingCardText('') }}>Cancel</button>
              <button
                className="px-3 py-2 rounded bg-blue-600 text-white disabled:opacity-50"
                disabled={!editingCardText.trim() || updateCardMutation.isPending}
                onClick={()=> updateCardMutation.mutate({ cardId: editingCardId, content: editingCardText.trim() })}
              >{updateCardMutation.isPending ? 'Saving...' : 'Save'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
