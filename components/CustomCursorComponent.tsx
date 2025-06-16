import React, { useState, useEffect, useRef } from 'react'

function CustomCursorComponent() {
    const cursorDotOutline = useRef<HTMLDivElement>(null)
    const cursorDot = useRef<HTMLDivElement>(null)
    const requestRef = useRef<number>(0)
    const previousTimeRef = useRef<number>(0)
    let [mousePosition, setMousePosition] = useState({ x: 0, y: 0 })
    const [width, setWidth] = useState<number>(
        typeof window !== 'undefined' ? window.innerWidth : 0
    )
    const [height, setHeight] = useState<number>(
        typeof window !== 'undefined' ? window.innerHeight : 0
    )
    let cursorVisible: any = useState(false) // temporary
    let cursorEnlarged: any = useState(false)

    /**
     * Mouse Moves
     */
    const onMouseMove = (event: { pageX: any; pageY: any }) => {
        const { pageX: x, pageY: y } = event
        setMousePosition({ x, y })
        positionDot(event)
    }
    const onMouseEnter = () => {
        cursorVisible.current = true
        toggleCursorVisibility()
    }
    const onMouseLeave = () => {
        cursorVisible.current = false
        toggleCursorVisibility()
    }
    const onMouseDown = () => {
        cursorEnlarged.current = true
        toggleCursorSize()
    }
    const onMouseUp = () => {
        cursorEnlarged.current = false
        toggleCursorSize()
    }
    const onResize = () => {
        setWidth(window.innerWidth)
        setHeight(window.innerHeight)
    }

    /**
     * Hooks
     */
    useEffect(() => {
        document.addEventListener('mousemove', onMouseMove)
        document.addEventListener('mouseenter', onMouseEnter)
        document.addEventListener('mouseleave', onMouseLeave)
        document.addEventListener('mousedown', onMouseDown)
        document.addEventListener('mouseup', onMouseUp)
        window.addEventListener('resize', onResize)
        requestRef.current = requestAnimationFrame(animateDotOutline)

        handleLinks()

        return () => {
            document.removeEventListener('mousemove', onMouseMove)
            document.removeEventListener('mouseenter', onMouseEnter)
            document.removeEventListener('mouseleave', onMouseLeave)
            document.removeEventListener('mousedown', onMouseDown)
            document.removeEventListener('mouseup', onMouseUp)
            window.removeEventListener('resize', onResize)
            cancelAnimationFrame(requestRef.current)
        }
    }, [])

    let { x, y } = mousePosition
    const winDimensions = { width, height }
    let endX = winDimensions.width / 2
    let endY = winDimensions.height / 2

    /**
     * Position Dot (cursor)
     * @param {event}
     */
    function positionDot(e: { pageX: any; pageY: any }) {
        cursorVisible.current = true
        toggleCursorVisibility()
        // Position the dot
        endX = e.pageX
        endY = e.pageY
        if (cursorDot.current) {
            cursorDot.current.style.top = `${endY}px`
            cursorDot.current.style.left = `${endX}px`
        }
    }

    /**
     * Toggle Cursor Visiblity
     */
    function toggleCursorVisibility() {
        if (cursorDot.current && cursorDotOutline.current) {
            cursorDot.current.style.opacity = cursorVisible ? '1' : '0'
            cursorDotOutline.current.style.opacity = cursorVisible ? '1' : '0'
        }
    }

    /**
     * Toggle Cursor Size
     */
    function toggleCursorSize() {
        if (cursorDot.current && cursorDotOutline.current) {
            if (cursorEnlarged.current) {
                cursorDot.current.style.transform =
                    'translate(-50%, -50%) scale(0.7)'
                cursorDotOutline.current.style.transform =
                    'translate(-50%, -50%) scale(5)'
            } else {
                cursorDot.current.style.transform =
                    'translate(-50%, -50%) scale(1)'
                cursorDotOutline.current.style.transform =
                    'translate(-50%, -50%) scale(1)'
            }
        }
    }

    /**
     * Handle LInks
     * Applies mouseover/out hooks on all links
     * to trigger cursor animation
     */
    function handleLinks() {
        document.querySelectorAll('.hover-link, a').forEach((el) => {
            el.addEventListener('mouseover', () => {
                cursorEnlarged.current = true
                toggleCursorSize()
            })
            el.addEventListener('mouseout', () => {
                cursorEnlarged.current = false
                toggleCursorSize()
            })
        })
    }

    /**
     * Animate Dot Outline
     * Aniamtes cursor outline with trailing effect.
     * @param {number} time
     */
    const animateDotOutline = (time: number) => {
        if (previousTimeRef.current !== undefined && cursorDotOutline.current) {
            const deltaX = (endX - x) / 8
            const deltaY = (endY - y) / 8
            x += deltaX
            y += deltaY
            cursorDotOutline.current.style.top = `${y}px`
            cursorDotOutline.current.style.left = `${x}px`
        }
        previousTimeRef.current = time
        requestRef.current = requestAnimationFrame(animateDotOutline)
    }

    return (
        <>
            <div
                ref={cursorDotOutline}
                id='cursor-dot-outline'
            />
            <div
                ref={cursorDot}
                id='cursor-dot'
            />
        </>
    )
}

export default CustomCursorComponent
