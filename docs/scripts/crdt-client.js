
import * as Y from 'yjs'
import { WebsocketProvider } from 'y-websocket'
import diff from 'fast-diff'

export function initCRDT(editorElement, noteId, user, onLogUpdate) {
    console.log('initCRDT called with:', { editorElement, noteId, user })
    if (!editorElement || !noteId) {
        console.error('initCRDT aborted: Missing editorElement or noteId')
        return;
    }

    // --- CONFIG ---
    const ydoc = new Y.Doc()
    const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const wsHost = window.location.host
    const provider = new WebsocketProvider(`${wsProtocol}//${wsHost}/yjs`, noteId, ydoc)

    provider.on('status', event => {
        console.log('Yjs WebSocket status:', event.status)
    })

    provider.on('sync', isSynced => {
        console.log('Yjs synced:', isSynced)
    })

    const ytext = ydoc.getText('content')
    const yLog = ydoc.getArray('shared-log')

    // --- AWARENESS ---
    const awareness = provider.awareness
    const userColor = user.color || `hsl(${Math.floor(Math.random() * 360)}, 70%, 50%)`
    const userName = user.name || user.id || 'Anonymous'

    awareness.setLocalStateField('user', {
        name: userName,
        color: userColor
    })

    // --- STATE ---
    let lastSyncedContent = ''
    let isComposing = false
    let isLocalUpdate = false
    let isRemoteUpdate = false
    let savedRelativeCursor = null
    const MAX_LOGS = 100

    // --- HELPER: Get cursor index in innerHTML terms ---
    // Inserts a temporary marker span into the DOM at the caret position,
    // reads its index in innerHTML, then removes it.
    // Uses a sentinel string in textContent to survive browser normalisation.
    const MARKER_SENTINEL = 'YJS_CURSOR_MARKER_SENTINEL'
    const getCursorIndex = (element) => {
        const selection = window.getSelection()
        if (!selection || selection.rangeCount === 0) return 0
        const range = selection.getRangeAt(0)

        const marker = document.createElement('span')
        marker.id = 'yjs-temp-marker'
        marker.textContent = MARKER_SENTINEL

        try {
            range.insertNode(marker)
            const html = element.innerHTML
            // Look for any variation of the marker (browser may reformat attributes)
            const searchStr = `>${MARKER_SENTINEL}<`
            const pos = html.indexOf(searchStr)
            marker.remove()
            if (pos >= 0) {
                // Return the position of the opening tag bracket before the sentinel
                const tagStart = html.lastIndexOf('<', pos)
                return tagStart >= 0 ? tagStart : 0
            }
            return 0
        } catch (e) {
            try { marker.remove() } catch (_) { }
            return 0
        }
    }

    // --- HELPER: Save cursor as Yjs relative position ---
    const updateRelativeCursor = () => {
        const selection = window.getSelection()
        const isFocused = document.activeElement === editorElement ||
            (selection.rangeCount > 0 && editorElement.contains(selection.anchorNode))

        if (isFocused && !isRemoteUpdate) {
            const index = getCursorIndex(editorElement)
            try {
                savedRelativeCursor = Y.createRelativePositionFromTypeIndex(ytext, index, 0)
                awareness.setLocalStateField('cursor', {
                    index: index,
                    updatedAt: Date.now()
                })
            } catch (e) {
                console.error('Failed to save relative cursor', e)
            }
        }
    }

    // --- REMOTE CURSOR RENDERING (off-screen clone approach) ---
    // IMPORTANT: We NEVER modify editorElement.innerHTML here.
    // Doing so would trigger input/selectionchange events → syncLocalToRemote → duplicate text.
    // Instead we clone the editor into a hidden off-screen div, insert markers there,
    // read coordinates, then discard the clone.

    const cursorContainer = document.createElement('div')
    cursorContainer.id = 'yjs-cursor-container'
    cursorContainer.style.position = 'absolute'
    cursorContainer.style.top = '0'
    cursorContainer.style.left = '0'
    cursorContainer.style.pointerEvents = 'none'
    cursorContainer.style.zIndex = '9999'
    document.body.appendChild(cursorContainer)

    let renderRequested = false
    const renderRemoteCursors = () => {
        if (renderRequested) return
        renderRequested = true

        requestAnimationFrame(() => {
            renderRequested = false
            const states = awareness.getStates()
            const cursorsToRender = []

            states.forEach((state, clientID) => {
                if (clientID === ydoc.clientID) return
                if (!state.user || !state.cursor) return
                cursorsToRender.push({ state, clientID })
            })

            if (cursorsToRender.length === 0) {
                cursorContainer.innerHTML = ''
                return
            }

            // Build a marked-up HTML string with all cursors embedded (descending order
            // so earlier indices aren't shifted by later insertions)
            const html = editorElement.innerHTML
            const sorted = [...cursorsToRender].sort((a, b) => b.state.cursor.index - a.state.cursor.index)

            let markedHTML = html
            const markerInfos = []

            sorted.forEach(c => {
                const markerId = `yjs-m-${c.clientID}`
                // Visible but zero-size span so getBoundingClientRect has a real size
                const markerTag = `<span id="${markerId}" style="display:inline-block;width:0;height:1em;overflow:hidden;"></span>`
                const idx = Math.min(Math.max(c.state.cursor.index, 0), markedHTML.length)
                markedHTML = markedHTML.slice(0, idx) + markerTag + markedHTML.slice(idx)
                markerInfos.push({ id: markerId, user: c.state.user })
            })

            // Mirror the editor's exact layout in an off-screen container
            const editorRect = editorElement.getBoundingClientRect()
            const editorStyle = window.getComputedStyle(editorElement)

            const offscreen = document.createElement('div')
            offscreen.style.cssText = [
                'position:fixed',
                `left:${editorRect.left}px`,
                `top:${editorRect.top}px`,
                `width:${editorRect.width}px`,
                `min-height:${editorRect.height}px`,
                'overflow:hidden',
                'visibility:hidden',
                'pointer-events:none',
                'z-index:-1',
                `font-family:${editorStyle.fontFamily}`,
                `font-size:${editorStyle.fontSize}`,
                `line-height:${editorStyle.lineHeight}`,
                `white-space:${editorStyle.whiteSpace}`,
                `word-break:${editorStyle.wordBreak}`,
                `padding:${editorStyle.padding}`,
                `box-sizing:${editorStyle.boxSizing}`,
            ].join(';')
            offscreen.innerHTML = markedHTML
            document.body.appendChild(offscreen)

            // Read coordinates while markers are present in the clone
            const newCursorsHTML = []
            markerInfos.forEach(m => {
                try {
                    const marker = offscreen.querySelector(`#${m.id}`)
                    if (!marker) return

                    const rect = marker.getBoundingClientRect()
                    // Ignore zero-rect: marker position is unknown or editor not visible
                    if (rect.width === 0 && rect.height === 0 && rect.top === 0 && rect.left === 0) return

                    const top = rect.top + window.scrollY
                    const left = rect.left + window.scrollX
                    const height = rect.height || parseInt(editorStyle.lineHeight) || 20

                    // Escape user name for inline HTML
                    const safeName = (m.user.name || 'User').replace(/</g, '&lt;').replace(/>/g, '&gt;')

                    newCursorsHTML.push(
                        `<div class="remote-cursor" style="position:absolute;left:${left}px;top:${top}px;height:${height}px;border-left:2px solid ${m.user.color};pointer-events:none;transition:left .1s ease-out,top .1s ease-out;">` +
                        `<div style="position:absolute;top:-1.5em;left:-2px;background:${m.user.color};color:white;font-size:12px;padding:2px 4px;border-radius:4px;white-space:nowrap;">${safeName}</div>` +
                        `</div>`
                    )
                } catch (e) { /* skip this cursor */ }
            })

            // Discard the clone — the real editor is completely untouched
            document.body.removeChild(offscreen)

            cursorContainer.innerHTML = newCursorsHTML.join('')
        })
    }

    awareness.on('change', renderRemoteCursors)

    // --- SYNC LOGIC ---

    const addSharedLogEntry = (action, text) => {
        const now = new Date()
        const timeStr = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}`

        const displaySafeText = text.length > 20 ? text.substring(0, 20) + '...' : text

        ydoc.transact(() => {
            yLog.push([{
                user: userName,
                color: userColor,
                time: timeStr,
                action: action,
                text: displaySafeText
            }])
            if (yLog.length > MAX_LOGS) {
                yLog.delete(0, yLog.length - MAX_LOGS)
            }
        })
    }

    yLog.observe(() => {
        if (onLogUpdate) {
            onLogUpdate(yLog.toArray().slice().reverse())
        }
    })

    // --- DOM <-> Yjs SYNC ---
    // Important: We are syncing `innerHTML` to attempt preservation of rich text structure.
    // WARNING: `fast-diff` on HTML strings is brittle. Ideally a rich-text binding (like Tiptap) should be used.

    const updateDOMFromYjs = () => {
        if (isComposing || isLocalUpdate) return

        const newContent = ytext.toString()
        const currentContent = editorElement.innerHTML

        if (currentContent !== newContent) {
            isRemoteUpdate = true

            let markedHTML = newContent
            let markerAdded = false

            if (savedRelativeCursor) {
                const absPos = Y.createAbsolutePositionFromRelativePosition(savedRelativeCursor, ydoc)
                if (absPos && absPos.type === ytext) {
                    const index = absPos.index
                    const markerTag = '<span id="yjs-restore-marker"></span>'
                    markedHTML = newContent.slice(0, index) + markerTag + newContent.slice(index)
                    markerAdded = true
                }
            }

            editorElement.innerHTML = markedHTML
            lastSyncedContent = newContent

            if (markerAdded) {
                const marker = editorElement.querySelector('#yjs-restore-marker')
                if (marker) {
                    const range = document.createRange()
                    const selection = window.getSelection()
                    range.setStartAfter(marker)
                    range.collapse(true)
                    selection.removeAllRanges()
                    selection.addRange(range)
                    marker.remove()
                }
            }

            isRemoteUpdate = false
        }
    }

    const syncLocalToRemote = () => {
        if (isRemoteUpdate) return
        const localContent = editorElement.innerHTML
        if (localContent === lastSyncedContent) return

        isLocalUpdate = true
        const changes = diff(lastSyncedContent, localContent)

        ydoc.transact(() => {
            let index = 0
            changes.forEach(([type, value]) => {
                if (type === 0) {
                    index += value.length
                } else if (type === -1) {
                    ytext.delete(index, value.length)
                    addSharedLogEntry('delete', value)
                } else if (type === 1) {
                    ytext.insert(index, value)
                    addSharedLogEntry('insert', value)
                    index += value.length
                }
            })
        }, 'local-input')

        updateRelativeCursor()
        lastSyncedContent = localContent
        isLocalUpdate = false
    }

    // --- EVENT LISTENERS ---
    editorElement.addEventListener('compositionstart', () => { isComposing = true })
    editorElement.addEventListener('compositionend', () => {
        isComposing = false
        updateDOMFromYjs()
    })

    editorElement.addEventListener('input', () => {
        syncLocalToRemote()
    })

    editorElement.addEventListener('mouseup', updateRelativeCursor)
    editorElement.addEventListener('keyup', (e) => {
        if (e.key.startsWith('Arrow') || ['Home', 'End', 'PageUp', 'PageDown'].includes(e.key)) {
            updateRelativeCursor()
        }
    })

    document.addEventListener('selectionchange', () => {
        if (document.activeElement === editorElement) {
            updateRelativeCursor()
        }
    })

    // Initial Sync Logic
    provider.once('synced', (isSynced) => {
        console.log('Initial sync complete. Is synced:', isSynced)

        if (ytext.toString().length > 0) {
            console.log('Remote content exists, updating local editor.')
            updateDOMFromYjs()
        } else {
            console.log('Remote content empty, initializing from local.')
            const initialContent = editorElement.innerHTML
            if (initialContent) {
                ytext.insert(0, initialContent)
                lastSyncedContent = initialContent
            }
        }
    })

    ydoc.on('update', () => {
        // Triggered on any update
    })

    ytext.observe(event => {
        if (event.transaction.origin === 'local-input') return
        if (isComposing) return
        updateDOMFromYjs()
    })

    return {
        provider,
        ydoc,
        cleanup: () => {
            provider.destroy()
            ydoc.destroy()
            cursorContainer.remove()
        }
    }
}
