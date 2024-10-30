import Accessor from "@arcgis/core/core/Accessor";
import { subclass, property } from "@arcgis/core/core/accessorSupport/decorators";
import { CalciteAlert } from "@esri/calcite-components-react";
import { ComponentProps, createContext, PropsWithChildren, useContext } from "react";
import { useAccessorValue } from "~/hooks/reactive";
import useInstance from "~/hooks/useInstance";

type ToastMessage = { title: string, message: string, key: string; severity: ComponentProps<typeof CalciteAlert>['kind'] }

@subclass()
class ToastStore extends Accessor {
  @property()
  messages = [] as ToastMessage[];

  toast = (message: ToastMessage) => {
    if (this.messages.some(m => m.key === message.key)) return;

    this.messages = [...this.messages, message];
  }

  complete = (message: ToastMessage) => {
    this.messages = this.messages.filter(m => m.key !== message.key);
  }
}

const ToastStoreContext = createContext<ToastStore>(null!);
const ToastContext = createContext<ToastStore['toast']>(null!);

function InternalToast({ store }: { store: ToastStore }) {
  const messages = useAccessorValue(() => store.messages) ?? [];

  return messages.map(message => (
    <CalciteAlert
      slot="alerts"
      key={message.key}
      icon
      kind={message.severity}
      label={message.title}
      open
      autoClose
      onCalciteAlertClose={() => {
        store.complete(message)
      }}
    >
      <p slot='title'>{message.title}</p>
      <p slot="message">{message.message}</p>
    </CalciteAlert>
  ))
}

export function useToast() {
  return useContext(ToastContext);
}

export function ToasterProvider({ children }: PropsWithChildren) {
  const store = useInstance(() => {
    return new ToastStore();
  });

  return (
    <ToastStoreContext.Provider value={store}>
      <ToastContext.Provider value={store.toast}>
        {children}
      </ToastContext.Provider>
    </ToastStoreContext.Provider>
  )
}

export function Toast() {
  const store = useContext(ToastStoreContext);
  return (
    <InternalToast store={store} />
  )
}

export class ToastableError extends Error {
  key: string;
  message: string;
  title: string;
  severity: ComponentProps<typeof CalciteAlert>["kind"];

  get toast(): ToastMessage {
    return {
      key: this.key,
      title: this.title,
      message: this.message,
      severity: this.severity,
    }
  }

  constructor(props: { key: string, message: string, title: string, severity: ComponentProps<typeof CalciteAlert>["kind"] }, options?: ErrorOptions) {
    super(props.message, options);
    this.key = props.key;
    this.message = props.message;
    this.title = props.title;
    this.severity = props.severity;
  }
}