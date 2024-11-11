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
import {
  CalcitePanel,
  CalciteShellPanel,
} from "@esri/calcite-components-react";
import useIsRoot from "~/hooks/useIsRoot";
import ModelOrigin from "./model-origin";
import SelectionInfo from "./selection-info/selection-info";
import ExportSettings from "./export-settings";
import { useEffect, useReducer } from "react";
import { BlockStateReducer, SidebarState } from "./sidebar-state";
import { useSelectionState } from "~/data/selection-store";
import { useAccessorValue } from "~/hooks/reactive";
import { useReferenceElementId } from "../selection/walk-through-context";

const createInitialState = () => ({
  modelOrigin: { mode: 'managed', state: 'closed' },
  selection: { mode: 'managed', state: 'closed' },
  exportSettings: { mode: 'managed', state: 'closed' },
} satisfies SidebarState);

export default function Sidebar() {
  const id = useReferenceElementId(['confirming', "updating-origin"], 'left');
  const isRoot = useIsRoot();

  const store = useSelectionState()
  const walkthroughState = useAccessorValue(() => store.walkthroughState);

  const [blockState, dispatch] = useReducer(
    BlockStateReducer,
    createInitialState()
  );

  useEffect(() => {
    switch (walkthroughState) {
      case 'not-started':
      case 'done': break;

      case 'placing-origin':
      case 'placing-terminal': {
        dispatch([{ block: 'modelOrigin', type: 'open' }]);
        break;
      }
      case 'confirming': {
        dispatch([{ block: 'selection', type: 'open' }]);
        break;
      }
      case 'downloading': {
        dispatch([
          { block: 'exportSettings', type: 'open' },
          { block: 'modelOrigin', type: 'close' },
          { block: 'selection', type: 'close' }
        ]);
        break;
      }
    }
  }, [walkthroughState]);

  return (
    <CalciteShellPanel slot="panel-end" collapsed={isRoot} style={{
      '--calcite-shell-panel-width': '30vw'
    }}>
      <CalcitePanel id={id}>
        <ModelOrigin state={blockState.modelOrigin.state} dispatch={dispatch} />
        <SelectionInfo
          state={blockState.selection.state}
          dispatch={dispatch}
        />
        <ExportSettings state={blockState.exportSettings.state} dispatch={dispatch} />
      </CalcitePanel>
    </CalciteShellPanel>
  );
}
