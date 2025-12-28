import {Genome} from "./genome.js";
import {Animal} from "./creature.js";

const clamp = (x, a, b) => (x < a ? a : (x > b ? b : x))

export class View {
    constructor(canvas, world, opts = {}) {
        this.canvas = canvas
        this.ctx = canvas.getContext("2d", {alpha: true})
        this.world = world

        this.centerX = 0
        this.centerY = 0
        this.scale = opts.initialZoom ?? opts.scale ?? 1.0
        this.selected = null

        this.width = canvas.width || 1
        this.height = canvas.height || 1

        this.running = false
        this.paused = false
        this.lastT = 0
        this.accumulator = 0

        this.stepHz = opts.stepHz ?? 60
        this.maxSubSteps = opts.maxSubSteps ?? 4

        this.keepScaleOnResize = opts.keepScaleOnResize ?? true
        this.hudFontPx = opts.hudFontPx ?? 12
        this.drawGrid = opts.drawGrid ?? true
        this.clearBackground = opts.clearBackground ?? true

        this.fps = 0
        this.frameCount = 0
        this.fpsTime = 0

        this.drag = {active: false, x: 0, y: 0}
        this.infoPanel = this.createInfoPanel(this.canvas)

        this.installControls()
        this.resizeToCSS({keepScale: this.keepScaleOnResize})

        window.addEventListener("resize", () => {
            this.resizeToCSS({keepScale: this.keepScaleOnResize})
        })

        document.addEventListener("fullscreenchange", () => {
            this.resizeToCSS({keepScale: this.keepScaleOnResize})
        })
    }

    createInfoPanel(canvas) {
        const parent = canvas.parentElement
        const wrap = document.createElement("div")
        wrap.style.position = "relative"
        wrap.style.display = "inline-block"
        wrap.style.width = canvas.style.width || ""
        wrap.style.height = canvas.style.height || ""
        parent.insertBefore(wrap, canvas)
        wrap.appendChild(canvas)
        this.uiRoot = wrap
        this.installUploadButton(wrap);

        const fs = document.createElement("button")
        fs.textContent = "fullscreen"
        fs.style.position = "absolute"
        fs.style.top = "12px"
        fs.style.right = "12px"
        fs.style.zIndex = "10"
        fs.addEventListener("click", () => this.toggleFullscreen())
        wrap.appendChild(fs)

        const panel = document.createElement("div")
        panel.style.position = "absolute"
        panel.style.top = "12px"
        panel.style.left = "12px"
        panel.style.zIndex = "10"
        panel.style.display = "none"
        panel.style.width = "260px"
        panel.style.padding = "10px"
        panel.style.background = "rgba(20,20,20,0.85)"
        panel.style.color = "#fff"
        panel.style.font = "12px system-ui, -apple-system, Segoe UI, Roboto, sans-serif"
        panel.style.borderRadius = "12px"
        panel.style.backdropFilter = "blur(8px)"

        const header = document.createElement("div")
        header.style.display = "flex"
        header.style.justifyContent = "space-between"
        header.style.alignItems = "center"
        header.style.gap = "10px"
        panel.appendChild(header)

        const title = document.createElement("div")
        title.style.fontWeight = "600"
        header.appendChild(title)

        const leave = document.createElement("button")
        leave.textContent = "leave"
        leave.addEventListener("click", () => this.selected = null)
        header.appendChild(leave)

        const stats = document.createElement("div")
        stats.style.marginTop = "8px"
        stats.style.whiteSpace = "pre"
        stats.style.fontFamily = "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace"
        panel.appendChild(stats)

        const copy = document.createElement("button")
        copy.textContent = "copy"
        copy.addEventListener("click", () => {
            if (this.selected) {
                navigator.clipboard.writeText(this.infoPanel.stats.textContent)
            }
        })
        header.appendChild(copy)

        const download = document.createElement("button")
        download.textContent = "download"
        download.addEventListener("click", () => {
          if (this.selected && !this.selected.isPlant) {
            const json = JSON.stringify(this.selected.genome.toJSON(), null, 2)
            const blob = new Blob([json], { type: 'application/json' })
            const url = URL.createObjectURL(blob)
            const a = document.createElement('a')
            a.href = url
            a.download = `creature-${this.selected.id}.json`
            a.click()
            URL.revokeObjectURL(url)
          }
        })
        header.appendChild(download)

        wrap.appendChild(panel)

        return {panel, title, stats}
    }

    installUploadButton(wrap) {
        const upload = document.createElement("input")
        upload.type = "file"
        upload.accept = ".json"
        upload.style.display = "none"
        wrap.appendChild(upload)

        const uploadBtn = document.createElement("button")
        uploadBtn.textContent = "upload"
        uploadBtn.style.position = "absolute"
        uploadBtn.style.top = "12px"
        uploadBtn.style.right = "100px"
        uploadBtn.style.zIndex = "10"
        uploadBtn.addEventListener("click", () => upload.click())
        wrap.appendChild(uploadBtn)

        upload.addEventListener("change", (e) => {
            const file = e.target.files[0]
            if (!file) return
            const reader = new FileReader()
            reader.onload = (e) => {
                try {
                    const data = JSON.parse(e.target.result)
                    const genome = Genome.fromJSON(data)
                    const animal = new Animal(this.world, 0, 0, genome)
                    this.world.add(animal)
                    this.selected = animal
                } catch (err) {
                    console.error('Failed to load genome:', err)
                }
            }
            reader.readAsText(file)
            upload.value = ''
        })
    }

    getDpr() {
        const rect = this.canvas.getBoundingClientRect()
        if (rect.width <= 0) {
            return 1
        }
        return this.canvas.width / rect.width
    }

    resize() {
        this.resizeToCSS({keepScale: this.keepScaleOnResize})
    }

    resizeToCSS({keepScale = true} = {}) {
        const rect = this.canvas.getBoundingClientRect()
        const dpr = window.devicePixelRatio || 1

        const prevW = this.canvas.width || 1
        const prevH = this.canvas.height || 1

        const newW = Math.max(1, Math.floor(rect.width * dpr))
        const newH = Math.max(1, Math.floor(rect.height * dpr))

        if (newW === prevW && newH === prevH) {
            this.width = prevW
            this.height = prevH
            return
        }

        this.canvas.width = newW
        this.canvas.height = newH
        this.width = newW
        this.height = newH

        if (keepScale) {
            const prevMin = Math.min(prevW, prevH)
            const newMin = Math.min(newW, newH)
            this.scale *= newMin / prevMin
        }
    }

    toScreenX(wx) {
        return (this.width * 0.5) + (wx - this.centerX) * this.scale
    }

    toScreenY(wy) {
        return (this.height * 0.5) + (wy - this.centerY) * this.scale
    }

    toWorldX(sx) {
        return (sx - this.width * 0.5) / this.scale + this.centerX
    }

    toWorldY(sy) {
        return (sy - this.height * 0.5) / this.scale + this.centerY
    }

    panBy(dx, dy) {
        this.centerX -= dx / this.scale
        this.centerY -= dy / this.scale
    }

    zoomAt(sx, sy, factor) {
        const wx = this.toWorldX(sx)
        const wy = this.toWorldY(sy)
        this.scale = clamp(this.scale * factor, 0.08, 8.0)
        this.centerX = wx - (sx - this.width * 0.5) / this.scale
        this.centerY = wy - (sy - this.height * 0.5) / this.scale
    }

    reset() {
        this.centerX = 0
        this.centerY = 0
        this.scale = 100.0
    }

    eventToScreen(clientX, clientY) {
        const rect = this.canvas.getBoundingClientRect()
        const dpr = rect.width > 0 ? (this.canvas.width / rect.width) : 1
        return {x: (clientX - rect.left) * dpr, y: (clientY - rect.top) * dpr}
    }

    toggleFullscreen() {
        const el = this.canvas
        const doc = document
        if (!doc.fullscreenElement) {
            if (el.requestFullscreen) {
                el.requestFullscreen()
            }
        } else {
            if (doc.exitFullscreen) {
                doc.exitFullscreen()
            }
        }
    }

    pickCreatureAtScreen(sx, sy) {
        const wx = this.toWorldX(sx)
        const wy = this.toWorldY(sy)

        let best = null
        let bestD = Infinity
        for (let i = 0; i < this.world.creatures.length; i++) {
            const c = this.world.creatures[i]
            const dx = wx - c.x
            const dy = wy - c.y
            const d2 = dx * dx + dy * dy
            const r2 = c.radius * c.radius
            if (d2 <= r2 && d2 < bestD) {
                bestD = d2
                best = c
            }
        }
        return best
    }

    updatePanel(c) {
        this.infoPanel.title.textContent = `creature #${c.id}${c.isPlant ? " (plant)" : ""}`
        const speed = Math.sqrt(c.vx * c.vx + c.vy * c.vy)
        const toDeg = 180 / Math.PI
        const lines = [
            `energy: ${c.energy.toFixed(1)} / ${c.maxEnergy.toFixed(1)} (${c.livingCost().toFixed(2)})`,
            `radius: ${c.radius.toFixed(2)}`,
            `pos: ${c.x.toFixed(1)}, ${c.y.toFixed(1)}`,
            `speed: ${speed.toFixed(2)}`,
            `angle: ${((c.angle ?? 0) * toDeg).toFixed(1)}°`,
            `turning: ${((c.angularVelocity ?? 0) * toDeg).toFixed(2)}°/frame`,
            `stunned: ${c.stunCount ?? 0}`
        ]
        if (c.partStates) {
            lines.push(``)
            lines.push(`Parts:`)
            for (const state of c.partStates) {
                lines.push(`  ${state.def.type.info(state)}`)
            }
        }
        this.infoPanel.stats.textContent = lines.join("\n")
    }

    installControls() {
        const canvas = this.canvas
        canvas.style.touchAction = "none"

        const down = (x, y) => {
            this.drag.active = true
            this.drag.x = x
            this.drag.y = y
        }

        const move = (x, y) => {
            if (!this.drag.active) {
                return
            }
            const dx = x - this.drag.x
            const dy = y - this.drag.y
            this.drag.x = x
            this.drag.y = y
            this.panBy(dx, dy)
        }

        const up = () => {
            this.drag.active = false
        }

        canvas.addEventListener("mousedown", (e) => {
            const p = this.eventToScreen(e.clientX, e.clientY)
            down(p.x, p.y)
        })

        window.addEventListener("mousemove", (e) => {
            const p = this.eventToScreen(e.clientX, e.clientY)
            move(p.x, p.y)
        })

        window.addEventListener("mouseup", () => {
            up()
        })

        canvas.addEventListener("touchstart", (e) => {
            const t = e.touches[0]
            const p = this.eventToScreen(t.clientX, t.clientY)
            down(p.x, p.y)
            e.preventDefault()
        }, {passive: false})

        canvas.addEventListener("touchmove", (e) => {
            const t = e.touches[0]
            const p = this.eventToScreen(t.clientX, t.clientY)
            move(p.x, p.y)
            e.preventDefault()
        }, {passive: false})

        canvas.addEventListener("touchend", (e) => {
            up()
            e.preventDefault()
        }, {passive: false})

        canvas.addEventListener("wheel", (e) => {
            const p = this.eventToScreen(e.clientX, e.clientY)
            const factor = Math.exp(-e.deltaY * 0.0012)
            this.zoomAt(p.x, p.y, factor)
            e.preventDefault()
        }, {passive: false})

        canvas.addEventListener("click", (e) => {
            const p = this.eventToScreen(e.clientX, e.clientY)
            const c = this.pickCreatureAtScreen(p.x, p.y)
            if (c) {
                this.selected = c;
            } else {
                this.selected = null;
            }
        })

        window.addEventListener("keydown", (e) => {
            if (e.key === " ") {
                this.paused = !this.paused
            }
            if (e.key === "r") {
                this.reset()
            }
            if (e.key === "f") {
                this.toggleFullscreen()
            }
            if (e.key === "ArrowUp") {
                this.panBy(0, 30)
            }
            if (e.key === "ArrowDown") {
                this.panBy(0, -30)
            }
            if (e.key === "ArrowLeft") {
                this.panBy(30, 0)
            }
            if (e.key === "ArrowRight") {
                this.panBy(-30, 0)
            }
            if (e.key === "q") {
                this.zoomAt(this.width * 0.5, this.height * 0.5, 0.9)
            }
            if (e.key === "=" || e.key === "+") {
                this.zoomAt(this.width * 0.5, this.height * 0.5, 1.0 / 0.9)
            }
            if (this.selected && !this.selected.isPlant) {
                const c = this.selected
                let doStun = true;
                if (e.key === "a") {
                    c.angle -= 0.1
                } else if (e.key === "d") {
                    c.angle += 0.1
                } else if (e.key === "w") {
                    c.vx += Math.cos(c.angle) * 2
                    c.vy += Math.sin(c.angle) * 2
                } else if (e.key === "s") {
                    c.vx -= Math.cos(c.angle) * 2
                    c.vy -= Math.sin(c.angle) * 2
                } else {
                    doStun = false;
                }
                if (doStun) {
                    c.stunFor(60);
                }
            }
        })
    }

    draw() {
        const ctx = this.ctx
        const dpr = this.getDpr()

        ctx.setTransform(1, 0, 0, 1, 0, 0)

        if (this.clearBackground) {
            ctx.clearRect(0, 0, this.width, this.height)
            ctx.fillStyle = "rgba(0,0,0,1)"
            ctx.fillRect(0, 0, this.width, this.height)
        }

        if (this.drawGrid) {
            const gridWorld = 100
            const step = gridWorld * this.scale
            if (step > 18 * dpr && step < 260 * dpr) {
                ctx.strokeStyle = "rgba(255,255,255,0.06)"
                ctx.lineWidth = 1 * dpr
                const ox = (this.width * 0.5 - (-this.centerX) * this.scale) % step
                const oy = (this.height * 0.5 - (-this.centerY) * this.scale) % step
                ctx.beginPath()
                for (let x = ox; x < this.width; x += step) {
                    ctx.moveTo(x, 0)
                    ctx.lineTo(x, this.height)
                }
                for (let y = oy; y < this.height; y += step) {
                    ctx.moveTo(0, y)
                    ctx.lineTo(this.width, y)
                }
                ctx.stroke()
            }
        }

        const s = this.scale
        const tx = this.width * 0.5 - this.centerX * s
        const ty = this.height * 0.5 - this.centerY * s
        ctx.setTransform(s, 0, 0, s, tx, ty)

        for (let i = 0; i < this.world.creatures.length; i++) {
            this.world.creatures[i].draw(ctx)
        }

        ctx.setTransform(1, 0, 0, 1, 0, 0)

        let animals = 0
        let biomass = 0
        for (let i = 0; i < this.world.creatures.length; i++) {
            const c = this.world.creatures[i]
            if (!c.isPlant) {
                animals++
            }
            biomass += c.energy
        }
        const food = this.world.creatures.length - animals

        ctx.fillStyle = "rgba(255,255,255,0.75)"
        ctx.font = `${this.hudFontPx * dpr}px system-ui, -apple-system, Segoe UI, Roboto, sans-serif`
        ctx.fillText(`creatures ${animals}   food ${food}   biomass ${(biomass / 100) | 0}   fps ${this.fps}`, 10 * dpr, 18 * dpr)
        if (this.paused) {
            ctx.fillText("paused", 10 * dpr, 36 * dpr)
        }
    }

    frame = (t) => {
        this.frameCount++
        if (t - this.fpsTime > 1000) {
          this.fps = this.frameCount
          this.frameCount = 0
          this.fpsTime = t
        }
        if (!this.running) {
            return
        }
        if (!this.lastT) {
            this.lastT = t
        }
        this.infoPanel.panel.style.display = this.selected ? "block" : "none"
        if (this.selected) {
            if (this.world.creatures.indexOf(this.selected) === -1) {
                this.selected = null;
            } else {
                this.centerX = this.selected.x
                this.centerY = this.selected.y
                this.updatePanel(this.selected)
            }
        }
        const dt = Math.min(0.06, (t - this.lastT) / 1000)
        this.lastT = t

        if (!this.paused) {
            this.accumulator += dt
            const stepDt = 1 / this.stepHz
            let n = 0
            while (this.accumulator >= stepDt && n < this.maxSubSteps) {
                this.world.stepOnce()
                this.accumulator -= stepDt
                n++
            }
        }

        this.draw()
        requestAnimationFrame(this.frame)
    }

    start() {
        if (this.running) {
            return
        }
        this.running = true
        requestAnimationFrame(this.frame)
    }

    stop() {
        this.running = false
    }
}