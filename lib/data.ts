import React from 'react'
import { CgWorkAlt } from 'react-icons/cg'
const featuresGeneration = './features.jpg'
const teppermans = './teppermans.jpg' //temp change to standart img tag
const promptopia = './promptopia.jpg'
const chatters = './chatters.jpg'
const adobeBadgeImg = './Adobe_Badge.png'
const ibmBadgeImg = './ibm.png'
const kudostokiddos = './kudostokiddos.jpg'
const googleSert = './1708707168479.jpeg'
const chattersBooking = './booking.png'
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
        title: 'Blog',
        description:
            'Create a Full-Stack Blog with Google Authentication, Featuring Capabilities for Post Creation with Images and Content',
        link: 'https://promtopia-401114.web.app/',
        github: 'https://github.com/mcmaxwell/promptopia',
        tags: ['Nextjs', 'MongonDB', 'Reactjs', 'tailwindcss', 'Typescript'],
        imageUrl: promptopia,
    },
    // {
    //     title: 'Civic news',
    //     description:
    //         'Create a Full-Stack News portal with Google Authentication, Featuring Capabilities for Post Creation with Images and Content',
    //     link: 'https://promtopia-401114.web.app/',
    //     github: 'https://github.com/mcmaxwell/promptopia',
    //     tags: ['Nextjs', 'MongonDB', 'Reactjs', 'tailwindcss', 'Typescript'],
    //     imageUrl: promptopia,
    // },
    {
        title: 'Kudos to kiddos',
        description: 'Project in progress',
        link: 'https://get-a-fun.web.app/',
        github: '',
        tags: ['bun', 'daisyui', 'Reactjs', 'tailwindcss', 'Typescript'],
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
    {
        title: 'Teppermans',
        description:
            'Change main menu, created custom deals and promotions features, styling and coding checkout and cart pages',
        link: 'https://www.teppermans.com/',
        github: '',
        tags: ['Magento 2'],
        imageUrl: teppermans,
    },
    {
        title: 'Chatters',
        description:
            'Created features ans styling product page and product listing page, styling and coding checkout and cart pages',
        link: 'https://chatters.ca/',
        github: '',
        tags: ['Magento 2'],
        imageUrl: chatters,
    },
    {
        title: 'Chatters',
        description: 'Custom booking system',
        link: ' https://chatters.ca/book/ontario/on-north-york-onch37',
        github: '',
        tags: ['knokoutjs'],
        imageUrl: chattersBooking,
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
        date: 'October, 2023',
    },
    {
        title: 'Adobe Certified Expert-Adobe Commerce Front-End Developer',
        imageUrl: adobeBadgeImg,
        date: 'October, 2022',
    },
    {
        title: 'Google Digital Marketing and E-Commerce Professional Certificate',
        imageUrl: googleSert,
        date: 'February, 2024',
    },
]
