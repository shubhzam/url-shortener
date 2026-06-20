import { configureStore } from '@reduxjs/toolkit'
import { api } from './api'

// the store only needs to nkow about the rtk query api slice for now -
// there are no other feature slices yt, seo this stays minimal on purpose
export const store = configureStore({
  reducer: {
    [api.reducerPath]: api.reducer,
  },
  // api.middleware is what actually makes requests fire, get cached, and get
  // invalidated - without concat-ing it in, the generated hooks exist but do nothing
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware().concat(api.middleware),
})

// these two types let typed hooks (useAppDispatch / useAppSelector, if we add
// them later) infer the right shape instead of being typed as `any`
export type RootState = ReturnType<typeof store.getState>
export type AppDispatch = typeof store.dispatch  