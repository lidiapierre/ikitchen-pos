import type { Metadata, NextPage } from 'next'
import type { JSX } from 'react'
import SectionManager from './SectionManager'

export const metadata: Metadata = {
  title: 'Sections — Admin',
}

const SectionsPage: NextPage = (): JSX.Element => {
  return <SectionManager />
}

export default SectionsPage
