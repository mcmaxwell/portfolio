'use client'

import React from 'react'
import { motion } from 'framer-motion'
import { links } from '@/lib/data'
import Link from 'next/link'
import clsx from 'clsx'
import { useActiveSectionContext } from '@/context/active-section-context'

export default function Header() {
    const { activeSection, setActiveSection, setTimeOfLastClick } =
        useActiveSectionContext()

    return (
        <header className='z-[999] relative'>
            <nav className='bg-black bg-opacity-20 backdrop-blur-[0.5rem] rounded-full dark:bg-white dark:bg-opacity-20 flex fixed top-[0.15rem] left-1/2 -translate-x-1/2 py-2 sm:top-[1.7rem] sm:py-0'>
                <ul className='flex w-[22rem] flex-wrap items-center justify-center gap-y-1 text-[0.9rem] font-medium text-gray-500 sm:w-[initial] sm:flex-nowrap sm:gap-5'>
                    {links.map((link) => (
                        <motion.li
                            className=' flex items-center justify-center relative'
                            key={link.hash}
                            initial={{ y: -100, opacity: 0 }}
                            animate={{ y: 0, opacity: 1 }}
                        >
                            <Link
                                className={clsx(
                                    'flex w-full items-center justify-center px-3 py-3 hover:text-gray-950 transition text-[#360e02] dark:text-gray-300 dark:hover:white',
                                    {
                                        'text-gray-950 dark:text-gray-300':
                                            activeSection === link.name,
                                    }
                                )}
                                href={link.hash}
                                onClick={() => {
                                    setActiveSection(link.name)
                                    setTimeOfLastClick(Date.now())
                                }}
                            >
                                {link.name}

                                {link.name === activeSection && (
                                    <motion.span
                                        className='bg-gray-100 rounded-full absolute inset-0 -z-10 dark:bg-[#360e02]'
                                        layoutId='activeSection'
                                        transition={{
                                            type: 'spring',
                                            stiffness: 380,
                                            damping: 30,
                                        }}
                                    ></motion.span>
                                )}
                            </Link>
                        </motion.li>
                    ))}
                </ul>
            </nav>
        </header>
    )
}
