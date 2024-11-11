/* Copyright 2024 Esri
 *
 * Licensed under the Apache License Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
import { PropsWithChildren, createContext, useContext, useState } from "react";

const SceneListModalContext = createContext<[
  open: boolean,
  setOpen: React.Dispatch<React.SetStateAction<boolean>>
]>(null!);

export function SceneListModalProvider({ children }: PropsWithChildren) {
  const state = useState(false);
  return (
    <SceneListModalContext.Provider value={state}>
      {children}
    </SceneListModalContext.Provider>
  )
}

export function useSceneListModal() {
  return useContext(SceneListModalContext);
}