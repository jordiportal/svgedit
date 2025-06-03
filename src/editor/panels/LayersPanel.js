import SvgCanvas from '@svgedit/svgcanvas'
import LayersPanelHtml from './LayersPanel.html'

const { $id, $click } = SvgCanvas

/**
 *
 */
class LayersPanel {
  /**
   * @param {PlainObject} editor
   */
  constructor (editor) {
    this.updateContextPanel = editor.topPanel.updateContextPanel.bind(editor.topPanel)
    this.editor = editor
  }

  /**
   * @param {PlainObject} e event
   * @returns {void}
   */
  lmenuFunc (e) {
    const action = e?.detail?.trigger
    switch (action) {
      case 'dupe':
        this.cloneLayer()
        break
      case 'delete':
        this.deleteLayer()
        break
      case 'merge_down':
        this.mergeLayer()
        break
      case 'merge_all':
        this.editor.svgCanvas.mergeAllLayers()
        this.updateContextPanel()
        this.populateLayers()
        break
    }
  }

  /**
   * @returns {void}
   */
  init () {
    const template = document.createElement('template')
    const { i18next } = this.editor

    template.innerHTML = LayersPanelHtml
    this.editor.$svgEditor.append(template.content.cloneNode(true))
    // layer menu added to DOM
    const menuMore = document.createElement('se-cmenu-layers')
    menuMore.setAttribute('id', 'se-cmenu-layers-more')
    menuMore.value = 'layer_moreopts'
    menuMore.setAttribute('leftclick', true)
    this.editor.$container.append(menuMore)
    menuMore.init(i18next)
    const menuLayerBox = document.createElement('se-cmenu-layers')
    menuLayerBox.setAttribute('id', 'se-cmenu-layers-list')
    menuLayerBox.value = 'layer-tree'
    menuLayerBox.setAttribute('leftclick', false)
    this.editor.$container.append(menuLayerBox)
    menuLayerBox.init(i18next)
    $click($id('layer_new'), this.newLayer.bind(this))
    $click($id('layer_delete'), this.deleteLayer.bind(this))
    $click($id('layer_up'), () => this.moveLayer.bind(this)(-1))
    $click($id('layer_down'), () => this.moveLayer.bind(this)(1))
    $click($id('layer_rename'), this.layerRename.bind(this))
    $id('se-cmenu-layers-more').addEventListener('change', this.lmenuFunc.bind(this))
    $id('se-cmenu-layers-list').addEventListener('change', (e) => { this.lmenuFunc(e) })
    $click($id('sidepanel_handle'), () => this.toggleSidePanel())
    this.toggleSidePanel(this.editor.configObj.curConfig.showlayers)
    
    // Escuchar cambios en el canvas usando bind() método correcto
    this.editor.svgCanvas.bind('selected', () => {
      setTimeout(() => this.updateSelection(), 10)
    })
    
    this.editor.svgCanvas.bind('changed', () => {
      setTimeout(() => this.populateLayers(), 10)
    })
  }

  toggleSidePanel (displayFlag) {
    if (displayFlag === undefined) {
      this.editor.$svgEditor.classList.toggle('open')
    } else if (displayFlag) {
      this.editor.$svgEditor.classList.add('open')
    } else {
      this.editor.$svgEditor.classList.remove('open')
    }
  }

  /**
   * @returns {void}
   */
  newLayer () {
    let uniqName
    let i = this.editor.svgCanvas.getCurrentDrawing().getNumLayers()
    do {
      uniqName = this.editor.i18next.t('layers.layer') + ' ' + ++i
    } while (this.editor.svgCanvas.getCurrentDrawing().hasLayer(uniqName))

    const newName = prompt(
      this.editor.i18next.t('notification.enterUniqueLayerName'),
      uniqName
    )
    if (!newName) {
      return
    }
    if (this.editor.svgCanvas.getCurrentDrawing().hasLayer(newName)) {
      alert(this.editor.i18next.t('notification.dupeLayerName'))
      return
    }
    this.editor.svgCanvas.createLayer(newName)
    this.updateContextPanel()
    this.populateLayers()
  }

  /**
   *
   * @returns {void}
   */
  deleteLayer () {
    if (this.editor.svgCanvas.deleteCurrentLayer()) {
      this.updateContextPanel()
      this.populateLayers()
      // Seleccionar la primera capa disponible
      const firstLayerHeader = document.querySelector('.layer-header')
      if (firstLayerHeader) {
        firstLayerHeader.classList.add('selected')
      }
    }
  }

  /**
   *
   * @returns {void}
   */
  cloneLayer () {
    const curIndex = this.editor.svgCanvas.indexCurrentLayer()
    const origName = this.editor.svgCanvas.getCurrentDrawing().getCurrentLayerName() + ' copy'

    let uniqName = origName
    let i = 1
    while (this.editor.svgCanvas.getCurrentDrawing().hasLayer(uniqName)) {
      uniqName = origName + ' ' + i
      i++
    }
    const newName = prompt(this.editor.i18next.t('notification.enterUniqueLayerName'), uniqName)
    if (!newName) {
      return
    }
    if (this.editor.svgCanvas.getCurrentDrawing().hasLayer(newName)) {
      alert(this.editor.i18next.t('notification.dupeLayerName'))
      return
    }
    this.editor.svgCanvas.cloneLayer(newName)
    this.updateContextPanel()
    this.populateLayers()
    this.editor.svgCanvas.setCurrentLayerPosition(curIndex + 1)
  }

  index (el) {
    // Función auxiliar para encontrar el índice de una capa
    // Ahora busca en los headers de capa en lugar de filas de tabla
    if (!el) return -1
    const headers = Array.from(document.querySelectorAll('.layer-header'))
    return headers.indexOf(el)
  }

  /**
   *
   * @returns {void}
   */
  mergeLayer () {
    const selectedHeader = document.querySelector('.layer-header.selected')
    if (!selectedHeader) return
    
    const headers = Array.from(document.querySelectorAll('.layer-header'))
    const selectedIndex = headers.indexOf(selectedHeader)
    
    if ((selectedIndex - 1) === this.editor.svgCanvas.getCurrentDrawing().getNumLayers() - 1) {
      return
    }
    
    this.editor.svgCanvas.mergeLayer()
    this.updateContextPanel()
    this.populateLayers()
  }

  /**
   * @param {Integer} pos
   * @returns {void}
   */
  moveLayer (pos) {
    const curPos = this.editor.svgCanvas.indexCurrentLayer()
    if (curPos !== -1) {
      this.editor.svgCanvas.setCurrentLayerPosition(curPos - pos)
      this.populateLayers()
    }
  }

  /**
   * @returns {void}
   */
  layerRename () {
    const selectedHeader = document.querySelector('.layer-header.selected')
    if (!selectedHeader) return
    
    const layerNameElement = selectedHeader.querySelector('.layer-name')
    const oldName = layerNameElement ? layerNameElement.textContent : ''
    const newName = prompt(this.editor.i18next.t('notification.enterNewLayerName'), oldName)
    
    if (!newName) {
      return
    }
    if (
      oldName === newName ||
      this.editor.svgCanvas.getCurrentDrawing().hasLayer(newName)
    ) {
      alert(this.editor.i18next.t('notification.layerHasThatName'))
      return
    }
    this.editor.svgCanvas.renameCurrentLayer(newName)
    this.populateLayers()
  }

  /**
   * This function highlights the layer passed in (by fading out the other layers).
   * If no layer is passed in, this function restores the other layers.
   * @param {string} [layerNameToHighlight]
   * @returns {void}
   */
  toggleHighlightLayer (layerNameToHighlight) {
    let i
    const curNames = []
    const numLayers = this.editor.svgCanvas.getCurrentDrawing().getNumLayers()
    for (i = 0; i < numLayers; i++) {
      curNames[i] = this.editor.svgCanvas.getCurrentDrawing().getLayerName(i)
    }

    if (layerNameToHighlight) {
      curNames.forEach((curName) => {
        if (curName !== layerNameToHighlight) {
          this.editor.svgCanvas
            .getCurrentDrawing()
            .setLayerOpacity(curName, 0.5)
        }
      })
    } else {
      curNames.forEach((curName) => {
        this.editor.svgCanvas.getCurrentDrawing().setLayerOpacity(curName, 1.0)
      })
    }
  }

  /**
   * @returns {void}
   */
  populateLayers () {
    this.editor.svgCanvas.clearSelection()
    const self = this
    const treeContainer = $id('layer-tree')
    
    // Limpiar contenido anterior
    while (treeContainer.firstChild) { 
      treeContainer.removeChild(treeContainer.firstChild) 
    }

    $id('selLayerNames').setAttribute('options', '')
    const drawing = this.editor.svgCanvas.getCurrentDrawing()
    const currentLayerName = drawing.getCurrentLayerName()
    let layer = this.editor.svgCanvas.getCurrentDrawing().getNumLayers()
    
    // Construir opciones para el select
    let values = ''
    let text = ''
    
    // Iterar por las capas en orden inverso (la capa superior se lista primero)
    while (layer--) {
      const name = drawing.getLayerName(layer)
      const layerGroup = drawing.getLayerByName(name)
      const isCurrentLayer = name === currentLayerName
      const isVisible = drawing.getLayerVisibility(name)
      
      // Crear elemento de capa
      const layerItem = this.createLayerTreeItem(name, layerGroup, isCurrentLayer, isVisible)
      treeContainer.appendChild(layerItem)
      
      // Construir opciones para select
      values = (values) ? values + '::' + name : name
      text = (text) ? text + ',' + name : name
    }
    
    $id('selLayerNames').setAttribute('options', text)
    $id('selLayerNames').setAttribute('values', values)
    
    // Ejecutar extensión cuando se pobla el panel de capas
    this.editor.svgCanvas.runExtensions('layersChanged')
  }

  /**
   * Crea un elemento de árbol para una capa
   * @param {string} layerName - Nombre de la capa
   * @param {SVGGElement} layerGroup - Elemento SVG de la capa
   * @param {boolean} isSelected - Si la capa está seleccionada
   * @param {boolean} isVisible - Si la capa es visible
   * @returns {HTMLElement} - Elemento DOM de la capa
   */
  createLayerTreeItem (layerName, layerGroup, isSelected, isVisible) {
    const self = this
    const layerItem = document.createElement('div')
    layerItem.className = 'layer-item'
    
    // Header de la capa
    const layerHeader = document.createElement('div')
    layerHeader.className = `layer-header ${isSelected ? 'selected' : ''}`
    
    // Toggle para expandir/colapsar
    const toggle = document.createElement('div')
    toggle.className = 'layer-toggle collapsed'
    
    // Ícono de visibilidad
    const visibility = document.createElement('div')
    visibility.className = `layer-visibility ${isVisible ? '' : 'hidden'}`
    
    // Nombre de la capa
    const nameSpan = document.createElement('span')
    nameSpan.className = 'layer-name'
    nameSpan.textContent = layerName
    
    // Información de la capa (número de elementos)
    const elements = this.getLayerElements(layerGroup)
    const info = document.createElement('span')
    info.className = 'layer-info'
    info.textContent = `(${elements.length})`
    
    // Ensamblar header
    layerHeader.appendChild(toggle)
    layerHeader.appendChild(visibility)
    layerHeader.appendChild(nameSpan)
    layerHeader.appendChild(info)
    
    // Contenedor de elementos
    const elementsContainer = document.createElement('div')
    elementsContainer.className = 'layer-elements'
    
    if (elements.length === 0) {
      const emptyMsg = document.createElement('div')
      emptyMsg.className = 'layer-empty'
      emptyMsg.textContent = 'Capa vacía'
      elementsContainer.appendChild(emptyMsg)
    } else {
      elements.forEach(element => {
        const elementItem = this.createElementTreeItem(element)
        elementsContainer.appendChild(elementItem)
      })
    }
    
    // Event listeners
    toggle.addEventListener('click', (e) => {
      e.stopPropagation()
      this.toggleLayerExpansion(toggle, elementsContainer)
    })
    
    visibility.addEventListener('click', (e) => {
      e.stopPropagation()
      const newVisibility = !isVisible
      this.editor.svgCanvas.setLayerVisibility(layerName, newVisibility)
      visibility.classList.toggle('hidden', !newVisibility)
      this.editor.svgCanvas.runExtensions('layerVisChanged')
    })
    
    layerHeader.addEventListener('click', (e) => {
      if (e.target === toggle || e.target === visibility) return
      this.selectLayer(layerName, layerHeader)
    })
    
    // Ensamblar elemento completo
    layerItem.appendChild(layerHeader)
    layerItem.appendChild(elementsContainer)
    
    return layerItem
  }

  /**
   * Crea un elemento de árbol para un elemento SVG
   * @param {Element} element - Elemento SVG
   * @param {number} level - Nivel de anidación (para indentación)
   * @returns {HTMLElement} - Elemento DOM del elemento
   */
  createElementTreeItem (element, level = 0) {
    const self = this
    const elementItem = document.createElement('div')
    elementItem.className = 'element-item'
    elementItem.setAttribute('data-element-id', element.id)
    elementItem.style.paddingLeft = `${level * 16}px` // Indentación basada en nivel
    
    // Verificar si es un grupo con elementos hijos
    const isGroup = element.tagName.toLowerCase() === 'g'
    const hasChildren = isGroup && this.getGroupElements(element).length > 0
    
    // Toggle para grupos con hijos
    if (hasChildren) {
      const toggle = document.createElement('div')
      toggle.className = 'element-toggle collapsed'
      toggle.style.width = '12px'
      toggle.style.height = '12px'
      toggle.style.marginRight = '4px'
      toggle.style.cursor = 'pointer'
      toggle.style.display = 'inline-flex'
      toggle.style.alignItems = 'center'
      toggle.style.justifyContent = 'center'
      toggle.style.fontSize = '8px'
      toggle.innerHTML = '▶'
      
      toggle.addEventListener('click', (e) => {
        e.stopPropagation()
        this.toggleGroupExpansion(element, elementItem, toggle)
      })
      
      elementItem.appendChild(toggle)
    } else {
      // Espacio para alinear elementos sin toggle
      const spacer = document.createElement('div')
      spacer.style.width = '16px'
      spacer.style.display = 'inline-block'
      elementItem.appendChild(spacer)
    }
    
    // Ícono del tipo de elemento
    const icon = document.createElement('div')
    icon.className = `element-icon ${element.tagName.toLowerCase()}`
    
    // Texto del elemento
    const text = document.createElement('span')
    text.className = 'element-text'
    
    // Determinar el texto a mostrar
    let elementText = ''
    if (element.id) {
      elementText = `#${element.id}`
    } else {
      elementText = element.tagName
    }
    
    // Si es texto, mostrar contenido
    if (element.tagName === 'text') {
      const textContent = element.textContent || ''
      if (textContent.length > 20) {
        elementText += ` "${textContent.substring(0, 17)}..."`
      } else if (textContent) {
        elementText += ` "${textContent}"`
      }
    }
    
    // Si es un grupo, mostrar cantidad de elementos
    if (isGroup && hasChildren) {
      const childCount = this.getGroupElements(element).length
      elementText += ` (${childCount})`
    }
    
    text.textContent = elementText
    
    // Detalles del elemento (dimensiones, posición, etc.)
    const details = document.createElement('span')
    details.className = 'element-details'
    details.textContent = this.getElementDetails(element)
    
    // Event listeners
    elementItem.addEventListener('click', (e) => {
      if (e.target.classList.contains('element-toggle')) return
      e.stopPropagation()
      this.selectElement(element, elementItem)
    })
    
    elementItem.addEventListener('mouseenter', () => {
      this.highlightElement(element, true)
    })
    
    elementItem.addEventListener('mouseleave', () => {
      this.highlightElement(element, false)
    })
    
    // Ensamblar elemento
    elementItem.appendChild(icon)
    elementItem.appendChild(text)
    elementItem.appendChild(details)
    
    return elementItem
  }

  /**
   * Obtiene los elementos visibles de una capa
   * @param {SVGGElement} layerGroup - Grupo SVG de la capa
   * @returns {Array} - Array de elementos
   */
  getLayerElements (layerGroup) {
    if (!layerGroup) return []
    
    const elements = []
    const children = layerGroup.children
    
    for (let i = 0; i < children.length; i++) {
      const child = children[i]
      // Omitir elementos <title> que son metadatos de la capa
      if (child.tagName !== 'title') {
        elements.push(child)
      }
    }
    
    return elements
  }

  /**
   * Obtiene los elementos visibles de un grupo
   * @param {SVGGElement} groupElement - Elemento de grupo SVG
   * @returns {Array} - Array de elementos hijos
   */
  getGroupElements (groupElement) {
    if (!groupElement || groupElement.tagName.toLowerCase() !== 'g') return []
    
    const elements = []
    const children = groupElement.children
    
    for (let i = 0; i < children.length; i++) {
      const child = children[i]
      // Omitir elementos <title> y otros metadatos
      if (child.tagName !== 'title' && child.tagName !== 'desc') {
        elements.push(child)
      }
    }
    
    return elements
  }

  /**
   * Obtiene detalles de un elemento para mostrar
   * @param {Element} element - Elemento SVG
   * @returns {string} - String con detalles
   */
  getElementDetails (element) {
    const tagName = element.tagName.toLowerCase()
    
    switch (tagName) {
      case 'rect':
        const width = element.getAttribute('width') || 0
        const height = element.getAttribute('height') || 0
        return `${Math.round(width)}×${Math.round(height)}`
      
      case 'circle':
        const r = element.getAttribute('r') || 0
        return `r=${Math.round(r)}`
      
      case 'ellipse':
        const rx = element.getAttribute('rx') || 0
        const ry = element.getAttribute('ry') || 0
        return `${Math.round(rx)}×${Math.round(ry)}`
      
      case 'line':
        const x1 = element.getAttribute('x1') || 0
        const y1 = element.getAttribute('y1') || 0
        const x2 = element.getAttribute('x2') || 0
        const y2 = element.getAttribute('y2') || 0
        const length = Math.sqrt(Math.pow(x2-x1, 2) + Math.pow(y2-y1, 2))
        return `L=${Math.round(length)}`
      
      case 'text':
        const fontSize = element.getAttribute('font-size') || 
                        element.style.fontSize || '12'
        return `${fontSize}px`
      
      case 'image':
        const imgWidth = element.getAttribute('width') || 0
        const imgHeight = element.getAttribute('height') || 0
        return `${Math.round(imgWidth)}×${Math.round(imgHeight)}`
      
      case 'g':
        const childCount = element.children.length
        return `(${childCount})`
      
      default:
        return tagName.toUpperCase()
    }
  }

  /**
   * Alterna la expansión de una capa
   * @param {HTMLElement} toggle - Elemento toggle
   * @param {HTMLElement} container - Contenedor de elementos
   */
  toggleLayerExpansion (toggle, container) {
    const isCollapsed = toggle.classList.contains('collapsed')
    
    if (isCollapsed) {
      toggle.classList.remove('collapsed')
      toggle.classList.add('expanded')
      container.classList.add('expanded')
    } else {
      toggle.classList.remove('expanded')
      toggle.classList.add('collapsed')
      container.classList.remove('expanded')
    }
  }

  /**
   * Selecciona una capa
   * @param {string} layerName - Nombre de la capa
   * @param {HTMLElement} layerHeader - Header de la capa
   */
  selectLayer (layerName, layerHeader) {
    // Remover selección previa de capas
    const allHeaders = document.querySelectorAll('.layer-header')
    allHeaders.forEach(header => header.classList.remove('selected'))
    
    // Remover selección previa de elementos
    const allElements = document.querySelectorAll('.element-item')
    allElements.forEach(element => element.classList.remove('selected'))
    
    // Seleccionar nueva capa
    layerHeader.classList.add('selected')
    this.editor.svgCanvas.setCurrentLayer(layerName)
    this.editor.svgCanvas.runExtensions('layersChanged')
  }

  /**
   * Selecciona un elemento
   * @param {Element} element - Elemento SVG
   * @param {HTMLElement} elementItem - Item del elemento en el árbol
   */
  selectElement (element, elementItem) {
    // Remover selección previa
    const allHeaders = document.querySelectorAll('.layer-header')
    allHeaders.forEach(header => header.classList.remove('selected'))
    
    const allElements = document.querySelectorAll('.element-item')
    allElements.forEach(item => item.classList.remove('selected'))
    
    // Seleccionar elemento
    elementItem.classList.add('selected')
    this.editor.svgCanvas.clearSelection()
    this.editor.svgCanvas.addToSelection([element])
    this.editor.topPanel.updateContextPanel()
  }

  /**
   * Resalta un elemento
   * @param {Element} element - Elemento a resaltar
   * @param {boolean} highlight - Si debe resaltarse o no
   */
  highlightElement (element, highlight) {
    if (highlight) {
      element.style.outline = '2px solid #4a90e2'
      element.style.outlineOffset = '1px'
    } else {
      element.style.outline = ''
      element.style.outlineOffset = ''
    }
  }

  /**
   * Sincroniza la selección del panel con los elementos seleccionados en el lienzo
   * @param {Array} selectedElements - Elementos seleccionados
   */
  syncSelection (selectedElements) {
    // Limpiar selección previa
    const allHeaders = document.querySelectorAll('.layer-header')
    allHeaders.forEach(header => header.classList.remove('selected'))
    
    const allElements = document.querySelectorAll('.element-item')
    allElements.forEach(item => item.classList.remove('selected'))
    
    if (selectedElements && selectedElements.length > 0) {
      // Marcar elementos seleccionados en el árbol
      selectedElements.forEach(element => {
        if (element && element.id) {
          const elementItem = document.querySelector(`[data-element-id="${element.id}"]`)
          if (elementItem) {
            elementItem.classList.add('selected')
            
            // Expandir la capa que contiene este elemento
            const layerItem = elementItem.closest('.layer-item')
            if (layerItem) {
              const toggle = layerItem.querySelector('.layer-toggle')
              const container = layerItem.querySelector('.layer-elements')
              if (toggle && container) {
                toggle.classList.remove('collapsed')
                toggle.classList.add('expanded')
                container.classList.add('expanded')
              }
            }
          }
        }
      })
    } else {
      // Si no hay elementos seleccionados, marcar la capa actual
      const currentLayerName = this.editor.svgCanvas.getCurrentDrawing().getCurrentLayerName()
      const allHeaders = document.querySelectorAll('.layer-header')
      allHeaders.forEach(header => {
        const layerNameElement = header.querySelector('.layer-name')
        if (layerNameElement && layerNameElement.textContent === currentLayerName) {
          header.classList.add('selected')
        }
      })
    }
  }

  /**
   * Actualiza el panel cuando cambia la selección en el lienzo
   */
  updateSelection () {
    const selectedElements = this.editor.svgCanvas.getSelectedElements()
    this.syncSelection(selectedElements)
  }

  /**
   * Alterna la expansión de un grupo de elementos
   * @param {Element} groupElement - Elemento de grupo
   * @param {HTMLElement} groupItem - Item del grupo en el árbol
   * @param {HTMLElement} toggle - Elemento toggle
   */
  toggleGroupExpansion (groupElement, groupItem, toggle) {
    const isCollapsed = toggle.classList.contains('collapsed')
    
    if (isCollapsed) {
      // Expandir: mostrar elementos hijos
      toggle.classList.remove('collapsed')
      toggle.classList.add('expanded')
      toggle.innerHTML = '▼'
      
      // Crear contenedor de elementos hijos
      const childrenContainer = document.createElement('div')
      childrenContainer.className = 'group-children'
      childrenContainer.setAttribute('data-group-id', groupElement.id)
      
      const groupElements = this.getGroupElements(groupElement)
      const currentLevel = this.getElementLevel(groupItem)
      
      groupElements.forEach(childElement => {
        const childItem = this.createElementTreeItem(childElement, currentLevel + 1)
        childrenContainer.appendChild(childItem)
      })
      
      // Insertar el contenedor de hijos después del elemento del grupo
      const layerElements = groupItem.closest('.layer-elements')
      let insertAfter = groupItem
      
      // Encontrar el lugar correcto para insertar
      const allItems = Array.from(layerElements.querySelectorAll('.element-item'))
      const groupIndex = allItems.indexOf(groupItem)
      
      if (groupIndex !== -1 && groupIndex < allItems.length - 1) {
        insertAfter = allItems[groupIndex]
      }
      
      // Insertar después del elemento del grupo
      insertAfter.parentNode.insertBefore(childrenContainer, insertAfter.nextSibling)
      
    } else {
      // Colapsar: remover elementos hijos
      toggle.classList.remove('expanded')
      toggle.classList.add('collapsed')
      toggle.innerHTML = '▶'
      
      // Buscar y remover el contenedor de hijos
      const existingChildren = document.querySelector(`[data-group-id="${groupElement.id}"]`)
      if (existingChildren) {
        existingChildren.remove()
      }
    }
  }

  /**
   * Obtiene el nivel de anidación de un elemento en el árbol
   * @param {HTMLElement} elementItem - Item del elemento
   * @returns {number} - Nivel de anidación
   */
  getElementLevel (elementItem) {
    const paddingLeft = elementItem.style.paddingLeft || '0px'
    const padding = parseInt(paddingLeft) || 0
    return Math.floor(padding / 16)
  }
}

export default LayersPanel
