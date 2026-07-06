import { useContext } from 'react'
import { Ctx } from './AppContextCore'

export const useApp = () => useContext(Ctx)
