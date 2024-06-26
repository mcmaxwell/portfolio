'use client'
import CustomCursorComponent from '@/components/CustomCursorComponent'
import About from '@/components/about'
import Achievements from '@/components/achievements'
import Contact from '@/components/contact'
import Experience from '@/components/experience'
import Intro from '@/components/intro'
import Projects from '@/components/projects'
import SectionDivider from '@/components/section-divider'
import Skills from '@/components/skills'

export default function Home() {
    return (
        <main className='flex flex-col items-center px-4'>
            <CustomCursorComponent />
            <Intro />
            <SectionDivider />
            <About />
            <Achievements />
            <Projects />
            <Skills />
            <Experience />
            <Contact />
        </main>
    )
}
