'use client'

import { useRef } from 'react'
import { achievementsData } from '@/lib/data'
import { motion, useScroll, useTransform } from 'framer-motion'

type AchievementDataProps = (typeof achievementsData)[number]

export default function Achievement({
    title,
    date,
    imageUrl,
}: AchievementDataProps) {
    const ref = useRef<HTMLDivElement>(null)
    const { scrollYProgress } = useScroll({
        target: ref,
        offset: ['0 1', '1.33 1'],
    })
    const scaleProgess = useTransform(scrollYProgress, [0, 1], [0.8, 1])
    const opacityProgess = useTransform(scrollYProgress, [0, 1], [0.6, 1])

    return (
        <motion.div
            ref={ref}
            style={{
                scale: scaleProgess,
                opacity: opacityProgess,
            }}
            className='group mb-2 sm:mb-8'
        >
            <section className='bg-gray-100 max-w-[42rem] border border-black/5 rounded-lg overflow-hidden sm:pr-8 flex justify-between hover:bg-gray-200 transition dark:text-white dark:bg-white/10 dark:hover:bg-white/20'>
                <div className='pt-4 pb-7 px-5 sm:pl-10 sm:pr-2 sm:pt-10 sm:max-w-[80%] flex flex-col h-full'>
                    <h3 className='text-xl font-semibold'>{title}</h3>
                    <p className='mt-2 leading-relaxed text-gray-700 dark:text-white/70'>
                        {date}
                    </p>
                </div>

                <img
                    src={imageUrl}
                    alt='Project I worked on'
                    className='mt-4 sm:block sm:mt-10 w-[4rem] h-[4rem] rounded-lg shadow-2xl'
                />
            </section>
        </motion.div>
    )
}
