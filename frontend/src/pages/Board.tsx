import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '@/lib/api'
import { DragDropContext, Droppable, Draggable, DropResult } from '@hello-pangea/dnd'
import { useEffect, useMemo, useState } from 'react'
import { logout as doLogout } from '@/lib/auth'
import { useNavigate } from 'react-router-dom'
import { Sparkles, Plus, Trash2, Edit2, LogOut, X, Check, LayoutDashboard, GripVertical } from 'lucide-react'
import toast, { Toaster } from 'react-hot-toast'

export default function Board() {
  const qc = useQueryClient()
  const nav = useNavigate()
  
  const { data, isLoading } = useQuery({
    queryKey: ['board'],
    queryFn: async () => (await api.get('/boards/me')).data,
  })

  // Local state for optimistic drag and drop
  const [local, setLocal] = useState<any | null>(null)
  useEffect(() => { if (data) setLocal(data) }, [data])

  // Modals & UI State
  const [showAddModal, setShowAddModal] = useState<boolean>(false)
  const [ideaText, setIdeaText] = useState<string>('')
  const [folderName, setFolderName] = useState<string>('')
  const [showAddFolder, setShowAddFolder] = useState<boolean>(false)
  
  const [editingClusterId, setEditingClusterId] = useState<string>('')
  const [editingClusterName, setEditingClusterName] = useState<string>('')
  
  const [showEditCardModal, setShowEditCardModal] = useState<boolean>(false)
  const [editingCardId, setEditingCardId] = useState<string>('')
  const [editingCardText, setEditingCardText] = useState<string>('')

  // Summary State
  const [summaryModalContent, setSummaryModalContent] = useState<string | null>(null)
  const [isSummarizing, setIsSummarizing] = useState<string | null>(null)

  const handleLogout = () => {
    doLogout()
    qc.clear()
    nav('/login', { replace: true })
  }

  // --- Mutations ---
  const handleMutationError = (error: any) => {
    toast.error(error?.response?.data?.detail || 'An error occurred')
  }

  const reorderMutation = useMutation({
    mutationFn: (payload: any) => api.post(`/boards/${local._id}/reorder`, payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['board'] }),
    onError: handleMutationError
  })

  const addCardMutation = useMutation({
    mutationFn: async (content: string) => {
      if (!local) return
      const firstCol = local.columns?.[0]
      return (await api.post(`/boards/${local._id}/cards`, { columnId: firstCol._id, content })).data
    },
    onSuccess: () => {
      toast.success('Idea added!')
      qc.invalidateQueries({ queryKey: ['board'] })
      setShowAddModal(false)
      setIdeaText('')
    },
    onError: handleMutationError
  })

  const summarizeMutation = useMutation({
    mutationFn: async (folderId?: string) => (await api.post(`/ai/boards/${local._id}/summarize`, { folderId })).data,
    onSuccess: (data: any) => {
      setSummaryModalContent(data.summary || 'No summary generated.')
      toast.success('AI Summary complete!')
    },
    onError: handleMutationError,
    onSettled: () => setIsSummarizing(null)
  })

  const assignToFolderMutation = useMutation({
    mutationFn: async ({ cardId, folderId }: { cardId: string; folderId: string | null }) => {
      if (folderId === null) {
        return (await api.patch(`/boards/${local._id}/cards/${cardId}`, { folderId: null })).data
      }
      return (await api.post(`/boards/${local._id}/folders/${folderId}/assign`, { cardIds: [cardId] })).data
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['board'] }),
    onError: handleMutationError
  })

  const createFolderMutation = useMutation({
    mutationFn: async (name: string) => (await api.post(`/boards/${local._id}/folders`, { name })).data,
    onSuccess: () => {
      toast.success('Cluster created')
      setFolderName('')
      setShowAddFolder(false)
      qc.invalidateQueries({ queryKey: ['board'] })
    },
    onError: handleMutationError
  })

  const updateFolderMutation = useMutation({
    mutationFn: async ({ folderId, name }: { folderId: string; name: string }) =>
      (await api.patch(`/boards/${local._id}/folders/${folderId}`, { name })).data,
    onSuccess: () => {
      setEditingClusterId('')
      setEditingClusterName('')
      qc.invalidateQueries({ queryKey: ['board'] })
    },
    onError: handleMutationError
  })

  const deleteFolderMutation = useMutation({
    mutationFn: async (folderId: string) => (await api.delete(`/boards/${local._id}/folders/${folderId}`)).data,
    onSuccess: () => {
      toast.success('Cluster deleted')
      qc.invalidateQueries({ queryKey: ['board'] })
    },
    onError: handleMutationError
  })

  const updateCardMutation = useMutation({
    mutationFn: async ({ cardId, content }: { cardId: string; content: string }) => {
      return (await api.patch(`/boards/${local._id}/cards/${cardId}`, { content })).data
    },
    onSuccess: () => {
      toast.success('Idea updated')
      setShowEditCardModal(false)
      setEditingCardId('')
      setEditingCardText('')
      qc.invalidateQueries({ queryKey: ['board'] })
    },
    onError: handleMutationError
  })

  const deleteCardMutation = useMutation({
    mutationFn: async (cardId: string) => (await api.delete(`/boards/${local._id}/cards/${cardId}`)).data,
    onSuccess: () => {
      toast.success('Idea removed')
      qc.invalidateQueries({ queryKey: ['board'] })
    },
    onError: handleMutationError
  })

  const folders = useMemo(()=> local?.folders || [], [local])

  if (isLoading || !local) {
    return (
      <div className="h-screen w-full bg-board-gradient flex items-center justify-center">
        <div className="bg-white/10 backdrop-blur px-8 py-4 rounded-xl shadow-xl border border-white/20 text-white font-display text-xl animate-pulse">Loading Workspace...</div>
      </div>
    )
  }

  const onDragEnd = (result: DropResult) => {
    const { destination, source, draggableId } = result
    if (!destination) return
    if (destination.droppableId === source.droppableId && destination.index === source.index) return

    const isSourceIdeas = source.droppableId === 'col_ideas'
    const isDestIdeas = destination.droppableId === 'col_ideas'
    
    const sourceFolderId = source.droppableId.startsWith('cluster:') ? source.droppableId.split(':')[1] : null
    const destFolderId = destination.droppableId.startsWith('cluster:') ? destination.droppableId.split(':')[1] : null

    // Optimistic UI Update
    const newLocal = { ...local }
    const draggedCard = newLocal.cards.find((c: any) => c._id === draggableId)
    
    if (draggedCard) {
      if (isDestIdeas) {
        draggedCard.folderId = null
      } else if (destFolderId) {
        draggedCard.folderId = destFolderId
      }
      setLocal(newLocal)
    }

    // Server Update
    if (isDestIdeas) {
       assignToFolderMutation.mutate({ cardId: draggableId, folderId: null })
       if (isSourceIdeas) {
         reorderMutation.mutate({ draggableId, source, destination })
       }
    } else if (destFolderId) {
       assignToFolderMutation.mutate({ cardId: draggableId, folderId: destFolderId })
    }
  }

  const unsortedCards = local.cards?.filter((c: any) => !c.folderId) || []

  return (
    <div className="h-screen w-full bg-board-gradient flex flex-col font-sans overflow-hidden">
      <Toaster position="top-right" />
      
      {/* Top Navigation */}
      <header className="bg-black/20 backdrop-blur-sm px-6 py-4 flex items-center justify-between shrink-0 border-b border-white/10 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-emerald-500/20 rounded-lg backdrop-blur-md">
            <LayoutDashboard className="w-6 h-6 text-emerald-300" />
          </div>
          <h1 className="text-2xl font-display font-bold tracking-tight text-white drop-shadow-sm">
            {local.title || 'Brainstorming Board'}
          </h1>
        </div>
        <div className="flex items-center gap-4">
          <button
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-2 bg-white text-emerald-900 hover:bg-emerald-50 px-5 py-2.5 rounded-lg font-semibold transition-all shadow-md"
          >
            <Plus className="w-5 h-5" /> New Idea
          </button>
          <div className="w-px h-6 bg-white/30 mx-1"></div>
          <button
            onClick={handleLogout}
            className="flex items-center justify-center w-10 h-10 text-white/80 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
            title="Logout"
          >
            <LogOut className="w-5 h-5" />
          </button>
        </div>
      </header>

      {/* Main Board Area */}
      <main className="flex-1 overflow-x-auto overflow-y-hidden p-6">
        <DragDropContext onDragEnd={onDragEnd}>
          <div className="flex items-start gap-6 h-full pb-4">
            
            {/* Unsorted / Backlog Column */}
            <div className="w-80 shrink-0 flex flex-col h-full">
              <div className="bg-slate-100/95 backdrop-blur-md rounded-xl p-3 flex flex-col h-full shadow-lg border border-white/50">
                <div className="flex items-center justify-between mb-3 px-2 py-1">
                  <h2 className="font-display font-semibold text-slate-800 text-lg flex items-center gap-2">
                    Backlog
                  </h2>
                  <span className="text-xs font-bold bg-slate-300/50 text-slate-600 px-2 py-1 rounded-full">{unsortedCards.length}</span>
                </div>
                
                <Droppable droppableId="col_ideas">
                  {(provided, snapshot) => (
                    <div 
                      ref={provided.innerRef} 
                      {...provided.droppableProps} 
                      className={`flex-1 overflow-y-auto px-1 pb-2 space-y-3 rounded-lg transition-colors ${snapshot.isDraggingOver ? 'bg-slate-200/50' : ''}`}
                    >
                      {unsortedCards.sort((a:any, b:any) => a.position - b.position).map((card: any, i: number) => (
                        <Draggable key={card._id} draggableId={card._id} index={i}>
                          {(prov, snap) => (
                            <div
                              ref={prov.innerRef}
                              {...prov.draggableProps}
                              className={`bg-white p-3.5 rounded-lg shadow-sm border border-slate-200 group hover:shadow-md hover:border-slate-300 transition-all ${snap.isDragging ? 'card-dragging' : ''}`}
                            >
                              <div className="flex items-start gap-2">
                                <div {...prov.dragHandleProps} className="text-slate-300 hover:text-slate-500 transition-colors cursor-grab active:cursor-grabbing mt-0.5">
                                  <GripVertical className="w-4 h-4" />
                                </div>
                                <p className="text-[15px] text-slate-700 leading-snug whitespace-pre-wrap flex-1">{card.content}</p>
                              </div>
                              <div className="mt-3 flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                <button onClick={() => { setEditingCardId(card._id); setEditingCardText(card.content); setShowEditCardModal(true) }} className="p-1.5 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-md transition-colors"><Edit2 className="w-3.5 h-3.5" /></button>
                                <button onClick={() => deleteCardMutation.mutate(card._id)} className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-md transition-colors"><Trash2 className="w-3.5 h-3.5" /></button>
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
            </div>

            {/* Clusters Columns */}
            {folders.map((folder: any) => {
              const clusterCards = local.cards?.filter((c:any) => c.folderId === folder._id) || []
              return (
                <div key={folder._id} className="w-80 shrink-0 flex flex-col h-full">
                  <div className="bg-slate-100/95 backdrop-blur-md rounded-xl p-3 flex flex-col h-full shadow-lg border border-white/50">
                    
                    {/* Cluster Header */}
                    <div className="flex flex-col mb-3 gap-2 px-1 pt-1">
                      <div className="flex items-center justify-between group">
                        <div className="flex items-center gap-2.5 flex-1">
                          <div className="w-3 h-3 rounded-full shadow-inner border border-black/10" style={{ backgroundColor: folder.color || '#0f766e' }} />
                          {editingClusterId === folder._id ? (
                            <input 
                              className="bg-white border border-slate-300 rounded-md px-2 py-1 text-sm font-semibold w-full focus:outline-none focus:ring-2 focus:ring-emerald-500" 
                              value={editingClusterName} 
                              onChange={(e)=>setEditingClusterName(e.target.value)}
                              onKeyDown={(e) => { if(e.key==='Enter') updateFolderMutation.mutate({ folderId: folder._id, name: editingClusterName }) }}
                              autoFocus
                            />
                          ) : (
                            <h2 className="font-display font-semibold text-slate-800 text-lg truncate flex-1">{folder.name}</h2>
                          )}
                        </div>
                        <div className="flex items-center gap-1 ml-2 opacity-0 group-hover:opacity-100 transition-opacity">
                           {editingClusterId === folder._id ? (
                             <>
                              <button onClick={() => updateFolderMutation.mutate({ folderId: folder._id, name: editingClusterName })} className="p-1 text-emerald-600 hover:bg-emerald-100 rounded-md"><Check className="w-4 h-4"/></button>
                              <button onClick={() => { setEditingClusterId(''); setEditingClusterName('') }} className="p-1 text-slate-500 hover:bg-slate-200 rounded-md"><X className="w-4 h-4"/></button>
                             </>
                           ) : (
                             <button onClick={() => { setEditingClusterId(folder._id); setEditingClusterName(folder.name) }} className="p-1.5 text-slate-400 hover:text-emerald-600 hover:bg-slate-200 rounded-md transition-colors"><Edit2 className="w-3.5 h-3.5"/></button>
                           )}
                           <button onClick={() => deleteFolderMutation.mutate(folder._id)} className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-slate-200 rounded-md transition-colors"><Trash2 className="w-3.5 h-3.5"/></button>
                        </div>
                      </div>
                      
                      {/* Summarize Button */}
                      <button 
                        onClick={() => { setIsSummarizing(folder._id); summarizeMutation.mutate(folder._id) }}
                        disabled={isSummarizing !== null || clusterCards.length === 0}
                        className="w-full flex items-center justify-center gap-2 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 text-indigo-700 py-1.5 rounded-md text-[13px] font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
                      >
                        {isSummarizing === folder._id ? (
                          <div className="flex items-center gap-2 animate-pulse"><Sparkles className="w-3.5 h-3.5"/> Generating...</div>
                        ) : (
                          <><Sparkles className="w-3.5 h-3.5" /> AI Summary</>
                        )}
                      </button>
                    </div>

                    {/* Droppable Area */}
                    <Droppable droppableId={`cluster:${folder._id}`}>
                      {(provided, snapshot) => (
                        <div 
                          ref={provided.innerRef} 
                          {...provided.droppableProps} 
                          className={`flex-1 overflow-y-auto px-1 pb-2 space-y-3 rounded-lg transition-colors ${snapshot.isDraggingOver ? 'bg-slate-200/50' : ''}`}
                        >
                          {clusterCards.map((card: any, i: number) => (
                            <Draggable key={card._id} draggableId={card._id} index={i}>
                              {(prov, snap) => (
                                <div
                                  ref={prov.innerRef}
                                  {...prov.draggableProps}
                                  className={`bg-white p-3.5 rounded-lg shadow-sm border border-slate-200 group hover:shadow-md hover:border-slate-300 transition-all ${snap.isDragging ? 'card-dragging ring-2 ring-emerald-500/50' : ''}`}
                                >
                                  {/* Color Indicator Strip */}
                                  <div className="w-10 h-1 mb-2.5 rounded-full" style={{ backgroundColor: folder.color || '#0f766e' }}></div>
                                  
                                  <div className="flex items-start gap-2">
                                    <div {...prov.dragHandleProps} className="text-slate-300 hover:text-slate-500 transition-colors cursor-grab active:cursor-grabbing">
                                      <GripVertical className="w-4 h-4" />
                                    </div>
                                    <p className="text-[15px] text-slate-700 leading-snug whitespace-pre-wrap flex-1">{card.content}</p>
                                  </div>
                                  <div className="mt-3 flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <button onClick={() => { setEditingCardId(card._id); setEditingCardText(card.content); setShowEditCardModal(true) }} className="p-1.5 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-md transition-colors"><Edit2 className="w-3.5 h-3.5" /></button>
                                    <button onClick={() => assignToFolderMutation.mutate({ cardId: card._id, folderId: null })} className="p-1.5 text-slate-400 hover:text-amber-600 hover:bg-amber-50 rounded-md font-semibold text-[11px] uppercase tracking-wider transition-colors">Remove</button>
                                  </div>
                                </div>
                              )}
                            </Draggable>
                          ))}
                          {provided.placeholder}
                          {clusterCards.length === 0 && !snapshot.isDraggingOver && (
                            <div className="h-20 border-2 border-dashed border-slate-300 rounded-lg flex items-center justify-center text-slate-400 text-sm font-medium mx-1 mt-1">
                              Drop ideas here
                            </div>
                          )}
                        </div>
                      )}
                    </Droppable>
                  </div>
                </div>
              )
            })}

            {/* Add Cluster Column */}
            <div className="w-80 shrink-0 h-full">
              {showAddFolder ? (
                 <div className="bg-slate-100/95 backdrop-blur-md rounded-xl p-4 border border-white/50 shadow-lg">
                    <h3 className="font-semibold text-slate-800 text-sm mb-3">Create New Cluster</h3>
                    <input 
                      autoFocus
                      className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 shadow-sm"
                      placeholder="e.g. Marketing, UI Design..."
                      value={folderName}
                      onChange={e=>setFolderName(e.target.value)}
                      onKeyDown={e => { if(e.key === 'Enter' && folderName.trim()) createFolderMutation.mutate(folderName.trim()) }}
                    />
                    <div className="flex gap-2 mt-3">
                      <button onClick={() => createFolderMutation.mutate(folderName.trim())} disabled={!folderName.trim() || createFolderMutation.isPending} className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white py-2 rounded-lg text-sm font-semibold transition-colors disabled:opacity-50 shadow-sm">Add</button>
                      <button onClick={() => { setShowAddFolder(false); setFolderName('') }} className="flex-1 bg-white hover:bg-slate-50 border border-slate-200 text-slate-600 py-2 rounded-lg text-sm font-semibold transition-colors shadow-sm">Cancel</button>
                    </div>
                 </div>
              ) : (
                <button 
                  onClick={() => setShowAddFolder(true)}
                  className="w-full h-14 bg-white/10 hover:bg-white/20 border border-white/20 backdrop-blur-sm rounded-xl flex items-center justify-center gap-2 font-semibold text-white transition-all shadow-sm group"
                >
                  <Plus className="w-5 h-5 group-hover:scale-110 transition-transform" /> Add Another Cluster
                </button>
              )}
            </div>

          </div>
        </DragDropContext>
      </main>

      {/* --- Modals --- */}
      
      {/* Add Idea Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg overflow-hidden animate-in fade-in zoom-in-95 duration-200 border border-slate-200">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
              <h3 className="font-display font-bold text-xl text-slate-800">New Idea</h3>
              <button onClick={() => setShowAddModal(false)} className="text-slate-400 hover:text-slate-600 hover:bg-slate-100 p-1.5 rounded-lg transition-colors"><X className="w-5 h-5"/></button>
            </div>
            <div className="p-6">
              <textarea
                autoFocus
                className="w-full border border-slate-300 rounded-lg p-4 h-32 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500 resize-none text-slate-700 shadow-sm"
                placeholder="What's on your mind?..."
                value={ideaText}
                onChange={e=>setIdeaText(e.target.value)}
              />
            </div>
            <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex justify-end gap-3">
              <button className="px-4 py-2 bg-white border border-slate-200 rounded-lg font-medium text-slate-600 hover:bg-slate-50 transition-colors shadow-sm" onClick={()=> setShowAddModal(false)}>Cancel</button>
              <button
                className="px-5 py-2 rounded-lg font-semibold bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm disabled:opacity-50 transition-colors flex items-center gap-2"
                disabled={!ideaText.trim() || addCardMutation.isPending}
                onClick={() => addCardMutation.mutate(ideaText.trim())}
              >
                {addCardMutation.isPending ? 'Adding...' : <><Plus className="w-4 h-4"/> Add Idea</>}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Idea Modal */}
      {showEditCardModal && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4 z-50">
           <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg overflow-hidden animate-in fade-in zoom-in-95 duration-200 border border-slate-200">
             <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
              <h3 className="font-display font-bold text-xl text-slate-800">Edit Idea</h3>
              <button onClick={() => setShowEditCardModal(false)} className="text-slate-400 hover:text-slate-600 hover:bg-slate-100 p-1.5 rounded-lg transition-colors"><X className="w-5 h-5"/></button>
            </div>
            <div className="p-6">
              <textarea
                autoFocus
                className="w-full border border-slate-300 rounded-lg p-4 h-32 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500 resize-none text-slate-700 shadow-sm"
                value={editingCardText}
                onChange={e=>setEditingCardText(e.target.value)}
              />
            </div>
             <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex justify-end gap-3">
              <button className="px-4 py-2 bg-white border border-slate-200 rounded-lg font-medium text-slate-600 hover:bg-slate-50 transition-colors shadow-sm" onClick={()=> { setShowEditCardModal(false); setEditingCardId(''); setEditingCardText('') }}>Cancel</button>
              <button
                className="px-5 py-2 rounded-lg font-semibold bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm disabled:opacity-50 transition-colors"
                disabled={!editingCardText.trim() || updateCardMutation.isPending}
                onClick={()=> updateCardMutation.mutate({ cardId: editingCardId, content: editingCardText.trim() })}
              >
                {updateCardMutation.isPending ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* AI Summary Modal */}
      {summaryModalContent && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden animate-in zoom-in-95 duration-300">
             <div className="px-8 py-6 border-b border-slate-100 flex items-center justify-between bg-indigo-50/50">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 bg-indigo-100 text-indigo-600 rounded-lg flex items-center justify-center"><Sparkles className="w-5 h-5"/></div>
                <h3 className="font-display font-bold text-2xl text-slate-800">AI Summary Insight</h3>
              </div>
              <button onClick={() => setSummaryModalContent(null)} className="text-slate-400 hover:text-slate-600 hover:bg-slate-100 p-2 rounded-lg transition-colors"><X className="w-5 h-5"/></button>
            </div>
            <div className="p-8 max-h-[60vh] overflow-y-auto bg-slate-50">
              <div className="bg-white p-6 rounded-xl border border-slate-200 text-slate-700 whitespace-pre-wrap leading-relaxed text-[15px] shadow-sm">
                {summaryModalContent}
              </div>
            </div>
             <div className="px-8 py-5 border-t border-slate-200 bg-white flex justify-end">
              <button 
                className="px-8 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-lg shadow-sm transition-colors" 
                onClick={()=> setSummaryModalContent(null)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  )
}
