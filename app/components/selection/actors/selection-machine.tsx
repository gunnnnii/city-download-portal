import { Point, Polygon } from "@arcgis/core/geometry";
import { contains } from "@arcgis/core/geometry/geometryEngine";
import GraphicsLayer from "@arcgis/core/layers/GraphicsLayer";
import SceneView from "@arcgis/core/views/SceneView";
import SketchViewModel from "@arcgis/core/widgets/Sketch/SketchViewModel";
import { assign, emit, enqueueActions, fromCallback, sendTo, setup } from "xstate";
import { FeatureQueryMachine } from "./feature-query-machine";
import { PlacePointActor } from "./place-point-actor";
import { editPolygonActor } from "./update-polygon-actor";
import { alignPolygonAfterChange } from "./utilities";
import { ElevationQueryMachine } from "./elevation-query-machine";

const updateOnClickCallback = fromCallback<any, { sketch: SketchViewModel, polygon: Polygon }>(({ input }) => {
  const sketch = input.sketch;
  const view = sketch.view;
  const layer = sketch.layer;
  const polygon = input.polygon;

  const handle = view.on("click", (event) => {
    if (contains(polygon, event.mapPoint)) {
      event.stopPropagation();
      sketch.update(layer.graphics.find(graphic => graphic.geometry.type === "polygon"))
    }
  })

  return handle.remove;
});

const watchForUpdates = fromCallback<any, SketchViewModel>(({ input: sketch, sendBack }) => {
  const deleteHandle = sketch.on("delete", () => {
    sendBack({ type: `delete` });
  });
  const handle = sketch.on("update", (event) => {
    if (event.toolEventInfo?.type === "vertex-remove") sendBack({ type: 'delete' });

    if (event.state === 'start') sendBack({ type: `update.${event.state}` })
  })

  return () => {
    handle.remove()
    deleteHandle.remove()
  }
});

type SketchEvent =
  | { type: 'create.start' }
  | { type: 'create.active', point: Point }
  | { type: 'create.complete', point?: Point }
  | { type: 'create.cancel', point?: Point }
  | { type: 'update.start', polygon?: Polygon }
  | { type: 'update.active', polygon: Polygon }
  | { type: 'update.complete', polygon?: Polygon }
  | { type: 'delete' }
  | { type: 'initialize', view: SceneView, layer: GraphicsLayer }

export type EmittedSelectionErrorEvents =
  | { type: 'error', message?: string }
  | { type: 'create.error', message?: string }
  | { type: 'update.error', message?: string }

type SketchMachineContext = {
  sketch: SketchViewModel;
  origin: Point | null;
  terminal: Point | null;
  polygon: Polygon | null;
  shouldUpdateAfterCreation: boolean;
}

type SketchMachineInput = {
  layer: GraphicsLayer;
  view: SceneView;
}

export const FEATURE_QUERY_ACTOR_ID = 'feature-query';
export const ELEVATION_QUERY_ACTOR_ID = 'elevation-query';

const updateOptions = {
  tool: 'reshape',
  reshapeOptions: {
    edgeOperation: 'offset',
    shapeOperation: 'none',
    vertexOperation: 'move-xy'
  },
  enableRotation: false,
  enableScaling: false,
  enableZ: false,
  multipleSelectionEnabled: false,
  toggleToolOnClick: false,
} as const;
export const SelectionMachine = setup({
  types: {
    context: {} as SketchMachineContext,
    events: {} as SketchEvent,
    emitted: {} as EmittedSelectionErrorEvents,
    input: {} as SketchMachineInput
  },
  actions: {
    assignOrigin: enqueueActions(({ enqueue }, point: Point | null = null) => {
      enqueue(({ context }) => context.sketch.layer.removeAll());
      enqueue.assign({ origin: point, terminal: null, polygon: null });
      enqueue.sendTo(ELEVATION_QUERY_ACTOR_ID, { type: 'changePosition', position: point });
    }),
    assignTerminal: assign({
      terminal: (_, { terminal, }: { terminal: Point, origin: Point }) => terminal,
      polygon: (_, { terminal, origin }) => {
        const polygon = new Polygon({
          rings: [[
            [origin.x, origin.y],
            [origin.x, terminal.y],
            [terminal.x, terminal.y],
            [terminal.x, origin.y],
            [origin.x, origin.y]
          ]],
          spatialReference: origin.spatialReference
        })
        return polygon;
      }
    }),
    assignPolygon: assign(({ context }, { next, previous }: { next: Polygon, previous: Polygon | null }) => {
      if (previous == null) return ({
        ...context,
        polygon: next,
      })

      const { origin, terminal } = context;

      const alignedPolygon = alignPolygonAfterChange(next, previous)
      const alignedRing = alignedPolygon.rings[0];

      const nextOrigin = origin!.clone() as Point;
      nextOrigin.x = alignedRing[0][0];
      nextOrigin.y = alignedRing[0][1];

      const nextTerminal = terminal!.clone() as Point;
      nextTerminal.x = alignedRing[2][0];
      nextTerminal.y = alignedRing[2][1];

      return ({
        ...context,
        origin: nextOrigin,
        terminal: nextTerminal,
        polygon: alignedPolygon,
      })
    }),
    cancel: enqueueActions(({ enqueue }) => {
      enqueue(({ context }) => {
        context.sketch.cancel();
        context.sketch.layer.removeAll();
      })
      enqueue.assign({ origin: null, terminal: null, polygon: null });
    }),
    updateFeatureQueryGeometry: sendTo(FEATURE_QUERY_ACTOR_ID, ({ context }) => ({ type: 'changeSelection', selection: context.polygon })),
    updateElevationQueryPosition: sendTo(ELEVATION_QUERY_ACTOR_ID, ({ context }) => ({
      type: 'changePosition', position: context.origin, ground: context.sketch.view.map.ground
    })),
    clearSelection: assign({
      origin: null,
      polygon: null,
      terminal: null,
    })
  },
  actors: {
    updateOnClickCallback,
    watchForUpdates,
    featureQueryMachine: FeatureQueryMachine,
    elevationQueryMachine: ElevationQueryMachine,
    placePoint: PlacePointActor,
    updatePolygon: editPolygonActor
  },
})
  .createMachine({
    context: ({
      sketch: null!,
      origin: null,
      terminal: null,
      polygon: null,
      shouldUpdateAfterCreation: true,
    }),
    initial: 'uninitialized',
    states: {
      uninitialized: {
        on: {
          initialize: {
            target: 'initialized',
            actions: assign({
              sketch: ({ context, event }) => {
                const layer = event.layer;
                const view = event.view;

                if (context.sketch) context.sketch.destroy();

                return new SketchViewModel({
                  view,
                  layer,
                  defaultUpdateOptions: updateOptions,
                  defaultCreateOptions: {
                    hasZ: false
                  },
                  tooltipOptions: {
                    enabled: true,
                    inputEnabled: true,
                  }
                })
              }
            })
          }
        }
      },
      initialized: {
        initial: 'nonExistent',
        invoke: [
          {
            src: 'watchForUpdates',
            input: ({ context }) => context.sketch
          },
          {
            id: FEATURE_QUERY_ACTOR_ID,
            src: 'featureQueryMachine',
            input: ({ context }) => ({ view: context.sketch.view as SceneView }),
          },
          {
            id: ELEVATION_QUERY_ACTOR_ID,
            src: 'elevationQueryMachine',
            input: ({ context }) => ({ ground: context.sketch.view.map.ground }),
          }
        ],
        states: {
          nonExistent: {
            entry: 'clearSelection',
            on: {
              "create.start": {
                target: 'creating'
              }
            }
          },
          creating: {
            initial: "origin",
            states: {
              origin: {
                invoke: {
                  src: 'placePoint',
                  input: ({ context }) => ({ sketch: context.sketch }),
                  onDone: [
                    {
                      target: "terminal",
                      actions: {
                        type: 'assignOrigin',
                        params: ({ event }) => event.output,
                      },
                    },
                    {
                      target: "#(machine).initialized.nonExistent",
                      actions: ['cancel'],
                    },
                  ],
                  onError: {
                    target: "#(machine).initialized.nonExistent",
                    actions: ['cancel', emit({ type: 'create.error' })],
                  },
                },
              },
              terminal: {
                invoke: {
                  src: "placePoint",
                  input: ({ context, self }) => ({
                    sketch: context.sketch,
                    onUpdate: (point) => self.send({ type: "create.active", point })
                  }),
                  onDone: [
                    {
                      target: "#(machine).initialized.created.updating",
                      guard: ({ context }) => context.shouldUpdateAfterCreation,
                      actions: [
                        {
                          type: 'assignTerminal',
                          params: ({ event, context }) => ({ terminal: event.output, origin: context.origin! })
                        },
                      ],
                    },
                    {
                      target: "#(machine).initialized.created",
                      actions: [
                        {
                          type: 'assignTerminal',
                          params: ({ event, context }) => ({ terminal: event.output, origin: context.origin! })
                        },
                      ],
                    },
                    {
                      target: "#(machine).initialized.nonExistent",
                      actions: 'cancel',
                    },
                  ],
                  onError: {
                    target: "#(machine).initialized.nonExistent",
                    actions: ['cancel', emit({ type: 'create.error' })],
                  },
                },
                on: {
                  "create.active": {
                    actions: [
                      {
                        type: 'assignTerminal',
                        params: ({ event, context }) => ({ terminal: event.point, origin: context.origin! })
                      },
                      'updateFeatureQueryGeometry',
                    ],
                  }
                }
              },
            },
            on: {
              "create.cancel": {
                target: "#(machine).initialized.nonExistent",
                actions: 'cancel'
              }
            }
          },
          created: {
            initial: 'idle',
            states: {
              idle: {
                invoke: {
                  src: "updateOnClickCallback",
                  input: ({ context }) => ({ sketch: context.sketch, polygon: context.polygon! })
                },
                on: {
                  'create.start': {
                    target: 'maybeCreating'
                  },
                  "update.start": {
                    target: "updating",
                  },
                }
              },
              maybeCreating: {
                invoke: {
                  src: 'placePoint',
                  input: ({ context }) => ({ sketch: context.sketch }),
                  onDone: [
                    {
                      target: "#(machine).initialized.creating.terminal",
                      actions: {
                        type: 'assignOrigin',
                        params: ({ event }) => event.output
                      }
                    },
                  ],
                  onError: {
                    target: "idle",
                    actions: emit({ type: 'create.error' })
                  },
                },
              },
              updating: {
                invoke: {
                  input: ({ context, self }) => ({
                    sketch: context.sketch,
                    onUpdate: (polygon) => self.send({ type: "update.active", polygon })
                  }),
                  onDone: { target: "idle" },
                  onError: { target: "idle", actions: emit({ type: 'update.error' }) },
                  src: "updatePolygon",
                },
                on: {
                  "update.active": {
                    actions: [
                      {
                        type: 'assignPolygon',
                        params: ({ context, event }) => ({ next: event.polygon, previous: context.polygon })
                      },
                      'updateFeatureQueryGeometry',
                      'updateElevationQueryPosition'
                    ]
                  },
                  "update.complete": {
                    actions: ({ context }) => context.sketch.complete()
                  }
                }
              },
            }
          },
        },
        on: {
          delete: {
            target: '.nonExistent'
          }
        }
      },
    }
  })
