import type { JSX } from 'react'
import MenuItemFormPage from '../../MenuItemFormPage'

interface EditMenuItemPageProps {
  params: Promise<{ id: string }>
}

export default async function EditMenuItemPage({ params }: EditMenuItemPageProps): Promise<JSX.Element> {
  const { id } = await params
  return <MenuItemFormPage mode="edit" itemId={id} />
}
