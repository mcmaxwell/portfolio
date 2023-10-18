'use client'

import React from 'react'
import SectionHeading from './section-heading'
import { achievementsData } from '@/lib/data'
import Achievement from './achievement'
import { useSectionInView } from '@/lib/hooks'

export default function Achievements() {
    const { ref } = useSectionInView('Achievements', 0.5)

    return (
        <section
            ref={ref}
            id='achievements'
            className='scroll-mt-28 mb-28'
        >
            <SectionHeading>My Achievements</SectionHeading>
            <div>
                {achievementsData.map((achievement, index) => (
                    <React.Fragment key={index}>
                        <Achievement {...achievement} />
                    </React.Fragment>
                ))}
            </div>
        </section>
    )
}
