
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
    // Connect to the server. Note: server.js handles '/yjs' prefix upgrade
    const provider = new WebsocketProvider(`${wsProtocol}//${wsHost}/yjs`, noteId, ydoc)

    provider.on('status', event => {
        console.log('Yjs WebSocket status:', event.status) // 'connected', 'disconnected', 'connecting'
    })

    provider.on('sync', isSynced => {
        console.log('Yjs synced:', isSynced)
    })


    const ytext = ydoc.getText('content') // Main content
    const yLog = ydoc.getArray('shared-log') // Shared logs

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

    // --- HELPER: Cursor Index (ContentEditable) ---
    // Note: This matches the raw text offset logic from CRDT_Test. 
    // Ideally should be adapted for HTML structure if possible, but start with text offset for stability.
    const getCursorIndex = (element) => {
        const selection = window.getSelection()
        if (!selection || selection.rangeCount === 0) return 0
        const range = selection.getRangeAt(0)

        // HTML-aware marker trick
        const marker = document.createElement('span')
        marker.id = 'yjs-temp-marker'
        range.insertNode(marker)

        const index = element.innerHTML.indexOf('<span id="yjs-temp-marker"></span>')
        marker.remove()

        // Handle cases where range.insertNode might fail or return weird index
        return index >= 0 ? index : 0
    }

    const updateRelativeCursor = () => {
        const selection = window.getSelection()
        const isFocued = document.activeElement === editorElement || (selection.rangeCount > 0 && editorElement.contains(selection.anchorNode))

        if (isFocued && !isRemoteUpdate) {
            const index = getCursorIndex(editorElement)
            try {
                // Now index refers to innerHTML position
                savedRelativeCursor = Y.createRelativePositionFromTypeIndex(ytext, index, 0)
                awareness.setLocalStateField('cursor', {
                    index: index, // This will be slightly off for remote markers since it's HTML index, but good enough for now
                    updatedAt: Date.now()
                })
            } catch (e) {
                console.error("Failed to save relative cursor", e)
            }
        }
    }

    // --- HELPER: Coordinates for Remote Cursors ---
    const getCoordinatesAtIndex = (element, index) => {
        try {
            const html = element.innerHTML
            const markerTag = '<span id="yjs-remote-marker-temp"></span>'
            const markedHTML = html.slice(0, index) + markerTag + html.slice(index)

            // We need to restore the selection if we are modifying innerHTML temporarily
            const selection = window.getSelection()
            const ranges = []
            for (let i = 0; i < selection.rangeCount; i++) ranges.push(selection.getRangeAt(i))

            const oldHTML = element.innerHTML
            element.innerHTML = markedHTML

            const marker = element.querySelector('#yjs-remote-marker-temp')
            let coords = null
            if (marker) {
                const rect = marker.getBoundingClientRect()
                coords = {
                    top: rect.top + window.scrollY,
                    left: rect.left + window.scrollX,
                    height: rect.height
                }
            }

            element.innerHTML = oldHTML

            // Restore selection
            selection.removeAllRanges()
            ranges.forEach(r => selection.addRange(r))

            return coords
        } catch (e) {
            // console.warn('Could not calculate coordinates', e)
        }
        return null
    }

    const cursorContainer = document.createElement('div')
    cursorContainer.id = 'yjs-cursor-container'
    cursorContainer.style.position = 'absolute'
    cursorContainer.style.top = '0'
    cursorContainer.style.left = '0'
    cursorContainer.style.pointerEvents = 'none'
    cursorContainer.style.zIndex = '9999'
    document.body.appendChild(cursorContainer)

    const renderRemoteCursors = () => {
        cursorContainer.innerHTML = ''
        const states = awareness.getStates()

        states.forEach((state, clientID) => {
            if (clientID === ydoc.clientID) return
            if (!state.user || !state.cursor) return

            const coords = getCoordinatesAtIndex(editorElement, state.cursor.index)
            if (coords) {
                const cursorDiv = document.createElement('div')
                cursorDiv.className = 'remote-cursor'
                cursorDiv.style.position = 'absolute'
                cursorDiv.style.left = `${coords.left}px`
                cursorDiv.style.top = `${coords.top}px`
                cursorDiv.style.height = `${coords.height || 20}px`
                cursorDiv.style.borderLeft = `2px solid ${state.user.color}`
                cursorDiv.style.pointerEvents = 'none'

                const labelDiv = document.createElement('div')
                labelDiv.textContent = state.user.name
                labelDiv.style.position = 'absolute'
                labelDiv.style.top = '-1.5em'
                labelDiv.style.left = '-2px'
                labelDiv.style.backgroundColor = state.user.color
                labelDiv.style.color = 'white'
                labelDiv.style.fontSize = '12px'
                labelDiv.style.padding = '2px 4px'
                labelDiv.style.borderRadius = '4px'
                labelDiv.style.whiteSpace = 'nowrap'

                cursorDiv.appendChild(labelDiv)
                cursorContainer.appendChild(cursorDiv)
            }
        })
    }

    awareness.on('change', renderRemoteCursors)

    // --- SYNC LOGIC ---

    const addSharedLogEntry = (action, text) => {
        const now = new Date()
        const timeStr = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}`

        // Truncate text for log
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

    const setCursorIndex = (element, index) => {
        // Restore cursor position based on text offset
        const range = document.createRange()
        const selection = window.getSelection()
        const treeWalker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT, null, false)
        let charCount = 0
        let found = false

        while (treeWalker.nextNode()) {
            const node = treeWalker.currentNode
            const len = node.textContent.length
            if (charCount + len >= index) {
                range.setStart(node, Math.max(0, index - charCount))
                range.collapse(true)
                found = true
                break
            }
            charCount += len
        }

        if (!found) {
            range.selectNodeContents(element)
            range.collapse(false)
        }

        selection.removeAllRanges()
        selection.addRange(range)
    }

    const updateDOMFromYjs = () => {
        if (isComposing || isLocalUpdate) return

        const newContent = ytext.toString()
        const currentContent = editorElement.innerHTML

        if (currentContent !== newContent) {
            isRemoteUpdate = true

            let markedHTML = newContent
            let markerAdded = false

            // Calculate new cursor index from relative position
            if (savedRelativeCursor) {
                const absPos = Y.createAbsolutePositionFromRelativePosition(savedRelativeCursor, ydoc)
                if (absPos && absPos.type === ytext) {
                    const index = absPos.index
                    const markerTag = '<span id="yjs-restore-marker"></span>'
                    markedHTML = newContent.slice(0, index) + markerTag + newContent.slice(index)
                    markerAdded = true
                }
            }

            // Update Content
            editorElement.innerHTML = markedHTML
            lastSyncedContent = newContent

            // Restore Cursor via Marker
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
        // Diff on innerHTML string
        const changes = diff(lastSyncedContent, localContent)

        ydoc.transact(() => {
            let index = 0
            changes.forEach(([type, value]) => {
                if (type === 0) { // Equal
                    index += value.length
                } else if (type === -1) { // Delete
                    ytext.delete(index, value.length)
                    addSharedLogEntry('delete', value)
                } else if (type === 1) { // Insert
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
        updateDOMFromYjs() // Check if we missed anything
    })

    // NoteTogether editor triggers 'input' on change
    editorElement.addEventListener('input', () => {
        syncLocalToRemote()
    })

    editorElement.addEventListener('mouseup', updateRelativeCursor)
    editorElement.addEventListener('keyup', (e) => {
        if (e.key.startsWith('Arrow') || ['Home', 'End', 'PageUp', 'PageDown'].includes(e.key)) {
            updateRelativeCursor()
        }
    })

    // Ensure we track every cursor movement
    document.addEventListener('selectionchange', () => {
        if (document.activeElement === editorElement) {
            updateRelativeCursor()
        }
    })

    // Initial Sync Logic
    // Wait for the provider to sync with the server before deciding on content
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
