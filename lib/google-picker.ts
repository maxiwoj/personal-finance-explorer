import { GOOGLE_API_KEY, GOOGLE_APP_ID } from './config'

const GAPI_SRC = 'https://apis.google.com/js/api.js'

export interface PickedSpreadsheet {
  id: string
  name: string
}

// Minimal typings for the parts of the Google Picker API we use
interface PickerDoc {
  id: string
  name: string
}

interface PickerResponse {
  action: string
  docs?: PickerDoc[]
}

interface PickerNamespace {
  Action: { PICKED: string; CANCEL: string }
  ViewId: { SPREADSHEETS: string }
  DocsViewMode: { LIST: string }
  DocsView: new (viewId: string) => {
    setMode: (mode: string) => unknown
    setIncludeFolders: (include: boolean) => unknown
  }
  PickerBuilder: new () => PickerBuilder
}

interface PickerBuilder {
  addView: (view: unknown) => PickerBuilder
  setOAuthToken: (token: string) => PickerBuilder
  setDeveloperKey: (key: string) => PickerBuilder
  setAppId: (appId: string) => PickerBuilder
  setTitle: (title: string) => PickerBuilder
  setCallback: (callback: (response: PickerResponse) => void) => PickerBuilder
  build: () => { setVisible: (visible: boolean) => void }
}

interface GapiWindow {
  gapi?: { load: (lib: string, options: { callback: () => void; onerror: () => void }) => void }
  google?: { picker?: PickerNamespace }
}

let pickerLoadPromise: Promise<PickerNamespace> | null = null

function loadPicker(): Promise<PickerNamespace> {
  if (pickerLoadPromise) return pickerLoadPromise

  pickerLoadPromise = new Promise<PickerNamespace>((resolve, reject) => {
    const w = window as unknown as GapiWindow

    const loadPickerLib = () => {
      w.gapi!.load('picker', {
        callback: () => (w.google?.picker ? resolve(w.google.picker) : reject(new Error('Google Picker unavailable'))),
        onerror: () => reject(new Error('Failed to load Google Picker')),
      })
    }

    if (w.gapi) {
      loadPickerLib()
      return
    }

    const script = document.createElement('script')
    script.src = GAPI_SRC
    script.async = true
    script.onload = loadPickerLib
    script.onerror = () => reject(new Error('Failed to load Google Picker'))
    document.body.appendChild(script)
  }).catch((error) => {
    pickerLoadPromise = null
    throw error
  })

  return pickerLoadPromise
}

export function isPickerConfigured(): boolean {
  return !!GOOGLE_API_KEY && !!GOOGLE_APP_ID
}

// Resolves with the picked spreadsheet, or null if the user closed the picker.
// Picking a file grants this app (drive.file scope) access to it.
export async function pickSpreadsheet(accessToken: string): Promise<PickedSpreadsheet | null> {
  if (!isPickerConfigured()) {
    throw new Error('Google Picker is not configured. Set NEXT_PUBLIC_GOOGLE_API_KEY and NEXT_PUBLIC_GOOGLE_APP_ID.')
  }

  const picker = await loadPicker()

  return new Promise((resolve) => {
    const view = new picker.DocsView(picker.ViewId.SPREADSHEETS)
    view.setMode(picker.DocsViewMode.LIST)
    view.setIncludeFolders(false)

    new picker.PickerBuilder()
      .addView(view)
      .setOAuthToken(accessToken)
      .setDeveloperKey(GOOGLE_API_KEY)
      // Without the app ID the file grant isn't tied to this project and Sheets API calls fail
      .setAppId(GOOGLE_APP_ID)
      .setTitle('Select your finance spreadsheet')
      .setCallback((response) => {
        if (response.action === picker.Action.PICKED && response.docs?.[0]) {
          const doc = response.docs[0]
          resolve({ id: doc.id, name: doc.name })
        } else if (response.action === picker.Action.CANCEL) {
          resolve(null)
        }
      })
      .build()
      .setVisible(true)
  })
}
