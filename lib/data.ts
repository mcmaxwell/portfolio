import React from 'react'
import { CgWorkAlt } from 'react-icons/cg'
import featuresGeneration from '@/public/features.jpg'
import teppermans from '@/public/teppermans.jpg'
import promptopia from '@/public/promptopia.jpg'
import chatters from '@/public/chatters.jpg'
import adobeBadgeImg from '@/public/Adobe_Badge.png'
import ibmBadgeImg from '@/public/ibm.png'
import kudostokiddos from '@/public/kudostokiddos.jpg'

export const links = [
    {
        name: 'Home',
        hash: '#home',
    },
    {
        name: 'About',
        hash: '#about',
    },
    {
        name: 'Achievements',
        hash: '#achievements',
    },
    {
        name: 'Projects',
        hash: '#projects',
    },
    {
        name: 'Skills',
        hash: '#skills',
    },
    {
        name: 'Experience',
        hash: '#experience',
    },
    {
        name: 'Contact',
        hash: '#contact',
    },
] as const

export const experiencesData = [
    {
        title: 'Junior Frontend Engineer',
        company: 'Ecommerce Craft',
        description: `- Converted PSD and Sketch designs into Magento 1.9 themes.`,
        icon: React.createElement(CgWorkAlt),
        date: '2014-2015',
    },
    {
        title: 'Junior Frontend Developer',
        company: '111Minutes',
        description: `- Collaborated with developers to create websites and single-page
applications.
- Utilized technologies such as JavaScript/ES6, ReactJS, Sass/Scss, and
HTML/CSS.`,
        icon: React.createElement(CgWorkAlt),
        date: '2016 - 2017',
    },
    {
        title: 'Frontend Developer',
        company: 'Orot Technologies s.r.o',
        description: `- Worked on Magento 1.9 and 2.x, customizing default themes.
- Developed frontend components for Magento 2 using ReactJS and
TypeScript and integrated with Magento's REST API.
- Conducted code reviews and debugging sessions.`,
        icon: React.createElement(CgWorkAlt),
        date: '2018 - 2020',
    },
    {
        title: 'Frontend Developer',
        company: 'Luxinten',
        description: `- Created Magento 2 themes and UI components.
- Assisted in reviewing developer code and interviewing frontend
candidates.
- Worked with technologies such as Knokoutjs, jQuery, Less, PHP,
JavaScript, XML, and CSS.`,
        icon: React.createElement(CgWorkAlt),
        date: '2020 - 2020',
    },
    {
        title: 'Frontend Developer',
        company: 'Overdose',
        description: `- Developed themes for Magento 2, including UI components and
customized checkouts.
- Led frontend development team, reviewing code and providing project
estimations.
- Utilized Knokoutjs, jQuery, Less, PHP, JavaScript, XML, and CSS.`,
        icon: React.createElement(CgWorkAlt),
        date: '2020 - 2022',
    },
    {
        title: 'E-commerce Developer',
        company: 'Northern Commerce',
        description: `Customized Magento 2 themes and created UI components.
- Developed a large-scale booking system using knockout widgets.
- Handled support fixes and led website redesigns/upgrades.
- Worked with Knokoutjs, jQuery, Less, PHP, JavaScript, XML, and CSS.`,
        icon: React.createElement(CgWorkAlt),
        date: '2022 - 2023',
    },
] as const

export const projectsData = [
    {
        title: 'Teppermans',
        description: 'Created features ans styling',
        link: 'https://www.teppermans.com/',
        github: '',
        tags: ['Magento 2'],
        imageUrl: teppermans,
    },
    {
        title: 'Chatters',
        description: 'Created features ans styling pages',
        link: 'https://chatters.ca/',
        github: '',
        tags: ['Magento 2'],
        imageUrl: chatters,
    },
    {
        title: 'Promptopia',
        description: 'Discover & Share AI-Powered Prompts',
        link: 'https://portfolio-c22ac.web.app/',
        github: 'https://github.com/mcmaxwell/promptopia',
        tags: [
            'Nextjs',
            'MongonDB',
            'Firebase',
            'Reactjs',
            'tailwindcss',
            'Typescript',
        ],
        imageUrl: promptopia,
    },
    {
        title: 'Kudos to kiddos',
        description: 'Project in progress',
        link: 'https://get-a-fun.web.app/',
        github: '',
        tags: [
            'bun',
            'daisyui',
            'Firebase',
            'Reactjs',
            'tailwindcss',
            'Typescript',
        ],
        imageUrl: kudostokiddos,
    },
    {
        title: 'features-generation',
        description: 'Text and Color generation',
        link: 'https://features-68967.web.app/',
        github: 'https://github.com/mcmaxwell/features-generation/blob/main/package.json',
        tags: ['React', 'Vite'],
        imageUrl: featuresGeneration,
    },
] as const

export const skillsData = [
    'HTML',
    'CSS',
    'SCSS',
    'JavaScript',
    'TypeScript',
    'React',
    'Git',
    'Tailwind',
    'Bootstrap',
    'Adobe Ecommerce / Magetno 2',
    'KnokoutJS',
    'jQuery',
] as const

export const achievementsData = [
    {
        title: 'IBM Web Development Fundamentals',
        imageUrl: ibmBadgeImg,
        date: 'October 03, 2023',
    },
    {
        title: 'Adobe Certified Expert-Adobe Commerce Front-End Developer',
        imageUrl: adobeBadgeImg,
        date: 'October 28, 2022',
    },
]
