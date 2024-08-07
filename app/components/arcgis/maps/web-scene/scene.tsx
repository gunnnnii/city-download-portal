import { PropsWithChildren, Suspense, memo, useEffect, useMemo, useState } from "react";
import CoreWebScene from '@arcgis/core/WebScene';
import PortalItem from '@arcgis/core/portal/PortalItem';
import { CalciteScrim } from "@esri/calcite-components-react";
import { useSceneListModal } from "~/components/scene-list-modal/scene-list-modal-context";
import { SceneContext } from "./scene-context";
import { useAccessorValue } from "~/hooks/reactive";

interface WebSceneProps {
  portalItem: string | PortalItem;
}

function InternalScene({ portalItem, children }: PropsWithChildren<WebSceneProps>) {
  const item = useMemo(() => {
    return typeof portalItem === "string" ? new PortalItem({
      id: portalItem,
    }) : portalItem
  }, [portalItem])

  const [scene, setScene] = useState(() => new CoreWebScene({
    portalItem: item
  }));

  const loaded = useAccessorValue(
    () => scene.loaded,
  )

  useEffect(() => {
    const isSamePortalItem =
      typeof portalItem === "string" ? item.id === portalItem : item.id === portalItem.id

    item.portal.units = 'metric';

    if (!isSamePortalItem) {
      setScene(new CoreWebScene({
        portalItem: item
      }));
    }
  }, [item, portalItem]);

  const [, setOpen] = useSceneListModal();

  useEffect(() => {
    if (loaded) setOpen(false);
  }, [loaded, setOpen]);

  return (
    <Suspense fallback={<CalciteScrim loading />}>
      <SceneContext.Provider value={scene}>
        {children}
      </SceneContext.Provider>
    </Suspense>
  );
}

const WebScene = memo(InternalScene)

export default WebScene;