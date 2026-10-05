import { doc, onSnapshot, serverTimestamp, setDoc } from 'firebase/firestore'
import { db } from './firebase.js'
import type { Preferences, TrainingHistory } from '../planner/types.js'

export interface FitnessState {
  preferences: Preferences
  history: TrainingHistory
  activeWeekStart: string
}

export function subscribeToFitnessState(userId: string, onData: (state: FitnessState | null) => void): () => void {
  if (!db) return () => undefined
  return onSnapshot(doc(db, 'users', userId, 'fitness', 'state'), (snapshot) => {
    onData(snapshot.exists() ? snapshot.data() as FitnessState : null)
  })
}

export async function saveFitnessState(userId: string, state: FitnessState): Promise<void> {
  if (!db) return
  await setDoc(doc(db, 'users', userId, 'fitness', 'state'), { ...state, updatedAt: serverTimestamp() }, { merge: true })
}
