'use client'

import { Provider } from 'react-redux'
import { store } from '../store/store'

// this has to be its own client component file - layout.tsx can stay a server
// component, but <Provider> uses react context, which only works client-side.
// wrapping just this piece in 'use client' keeps the rest of the app server-rendered
export function Providers({ children }: { children: React.ReactNode }) {
  return <Provider store={store}>{children}</Provider>
}