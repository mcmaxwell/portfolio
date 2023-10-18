'use client'

import React from 'react'
import SectionHeading from './section-heading'
import { motion } from 'framer-motion'
import { useSectionInView } from '@/lib/hooks'

export default function About() {
    const { ref } = useSectionInView('About')

    return (
        <motion.section
            ref={ref}
            className='mb-28 max-w-[45rem] text-center leading-8 sm:mb-40 scroll-mt-28'
            initial={{ opacity: 0, y: 100 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.175 }}
            id='about'
        >
            <SectionHeading>About me</SectionHeading>
            <p className='mb-3'>
                I like my job as a front-end developer. I developed and
                implemented interesting ideas at 111 Minutes, where I first
                started to write code with ReactJS. In Orot Technologies company
                I switched to e-commerce projects, which used Magento, where I
                later combined my earlier knowledge of ReactJS and wrote the
                front end part of Magento 2 online store in ReactJS +
                typescript. I started to develop leadership skills at Luxinten,
                where I was the lead front-end developer. After I joined
                Overdose company I went deeper into Magento2 and also became the
                leading front-end developer in the team, where I consulted and
                reviewed the code of other developers, took part in the
                evaluation of the projects, and developed custom modules for
                online stores. Last two years I worked with magento 2 and in the
                last year, I have become an{' '}
                <span className='font-bold italic'>
                    Adobe Certified Expert-Adobe Commerce Front-End Developer
                </span>
                .
            </p>

            <p>
                <span className='italic'>When I&apos;m not coding</span>, I
                enjoy playing soccer, watching movies, and playing with my kids.
                I also enjoy{' '}
                <span className='font-medium'>learning new things</span>. I am
                currently learning about{' '}
                <span className='font-medium'>culinary ans space</span>.
            </p>
        </motion.section>
    )
}
