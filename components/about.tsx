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
                Adobe Certified Front-End Web Developer with extensive
                experience in Magento and Wordpress. Demonstrated e-commerce
                development expertise, creating custom online store modules, and
                leading frontend teams, committed to best-in class front-end
                experiences, user engagement, satisfaction, and loyalty. Adept
                at combining innovative technologies like ReactJS with Magento
                to enhance e-commerce capabilities. Dedicated to continuous
                learning, recently updated skills with the latest version of
                Reactjs. Created several projects using Typescript and
                Nextjs, for the backend using Express and MongoDB.
            </p>

            <p>
                <span className='italic'>When I&apos;m not coding</span>, I
                enjoy playing soccer, watching movies, and playing with my kids.
                I also enjoy{' '}
                <span className='font-medium'>learning new things</span>. I am
                currently learning about{' '}
                <span className='font-medium'>culinary and space</span>.
            </p>
        </motion.section>
    )
}
