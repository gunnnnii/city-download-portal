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
import type { LoaderFunctionArgs, MetaFunction } from "@remix-run/node";
import { Suspense, lazy } from "react";
import { redirect, useLoaderData, useRouteError } from "@remix-run/react";
import Sidebar from "~/components/sidebar/sidebar";
import invariant from "tiny-invariant";
import { ViewUI } from "~/components/arcgis/views/scene-view/scene-view-ui";
import { CalciteAction, CalciteNavigation, CalciteNavigationLogo, CalciteNavigationUser, CalcitePopover, CalciteScrim } from "@esri/calcite-components-react";
import { useSceneListModal } from "~/components/scene-list-modal/scene-list-modal-context";
import { useAccessorValue } from "~/hooks/reactive";
import PortalItem from "@arcgis/core/portal/PortalItem";
import SelectionGraphic from "~/components/selection/selection-graphic";
import { SketchLayer } from "~/components/arcgis/sketch/sketch-layer";
import { CreateSelectionTool } from "~/components/selection/selection-tools/create-selection-tool";
import WalkthroughPopover from "~/components/selection/walk-through-popover";
import { RootShellPortal } from "~/components/root-shell";
import { useMutation } from "@tanstack/react-query";

const SceneView = lazy(() => import('~/components/arcgis/views/scene-view/scene-view'));
const Scene = lazy(() => import('~/components/arcgis/maps/web-scene/scene'));
const Search = lazy(() => import('~/components/arcgis/search/search'));

export const meta: MetaFunction<typeof clientLoader> = ({ data }) => {
  return [
    { title: data?.title },
    { name: "description", content: data?.description },
  ];
};

export async function clientLoader({ params }: LoaderFunctionArgs) {
  invariant(params.scene, "Expected params.scene");

  const scene = new PortalItem({
    id: params.scene,
  });


  if (scene == null) {
    throw redirect("/");
  }

  await scene.load();

  return {
    instance: scene,
    title: scene.title,
    description: scene.description,
    thumbnailUrl: scene.thumbnailUrl,
  };
}

function Header({ portalItem }: { portalItem: PortalItem }) {
  const [, setOpen] = useSceneListModal();

  const identityMutation = useMutation({
    mutationFn: async ({ portalUrl }: { portalUrl: string }) => {
      const { default: IdentityManager } = await import('@arcgis/core/identity/IdentityManager');
      try {
        await IdentityManager.checkSignInStatus(portalUrl)
        IdentityManager.destroyCredentials();

        // signing out does not clear the userinfo from the portalItem
        // so we reload the entire page to clear all the user info
        location.reload();
      } catch (_error) {
        return await IdentityManager.getCredential(portalUrl + "/sharing");
      }
    }
  })

  const fullName = useAccessorValue(() => portalItem.portal.user?.fullName);
  const username = useAccessorValue(() => portalItem.portal.user?.username);
  const avatar = useAccessorValue(() => portalItem.portal.user?.thumbnailUrl)

  const title = useAccessorValue(() => portalItem.title);
  const description = useAccessorValue(() => portalItem.description);

  return (
    <CalciteNavigation slot="header">
      <CalciteNavigationLogo slot="logo" heading={title} description={description} />
      <div slot="content-end">
        <CalciteNavigationUser
          className="h-full"
          id="user-menu"
          full-name={fullName}
          username={username}
          thumbnail={avatar}
        />
        <CalcitePopover
          label="Sign in settings"
          referenceElement="user-menu"
          placement="bottom-end"
          offsetDistance={0}
          pointer-disabled
          autoClose
          triggerDisabled={identityMutation.isPending}
        >
          <CalciteAction
            text={fullName == null ? "Sign in" : "Sign out"}
            label={fullName == null ? "Sign in" : "Sign out"}
            textEnabled
            scale="l"
            disabled={identityMutation.isPending}
            onClick={() => {
              identityMutation.mutate({
                portalUrl: portalItem.portal.url,
              });
            }}
          >
            {fullName == null ? "Sign in" : "Sign out"}
          </CalciteAction>
        </CalcitePopover>
      </div>
      <CalciteAction slot="navigation-action" text={""} icon="hamburger" onClick={() => setOpen(true)} />
    </CalciteNavigation>
  )
}

export default function SceneRoute() {
  const {
    instance
  } = useLoaderData() as Awaited<ReturnType<typeof clientLoader>>;

  return (
    <Suspense fallback={<CalciteScrim />}>
      <Scene portalItem={instance}>
        <Header portalItem={instance} />
        <SceneView>
          <SketchLayer disableZ elevationMode="on-the-ground">
            <Search />
            <Sidebar />
            <ViewUI position="bottom-left">
              <div className="flex gap-4">
                <SelectionGraphic />
                <CreateSelectionTool />
              </div>
            </ViewUI>
            <RootShellPortal>
              <WalkthroughPopover />
            </RootShellPortal>
          </SketchLayer>
        </SceneView>
      </Scene>
    </Suspense>
  );
}

export function ErrorBoundary() {
  const error = useRouteError();

  if (error instanceof Error) {
    return (
      <div>
        <h1>Error</h1>
        <p>{error.message}</p>
        <p>The stack trace is:</p>
        <pre>{error.stack}</pre>
      </div>
    );
  } else {
    return <h1>Unknown Error</h1>;
  }
}
