import {
  addElement,
  render,
} from "https://raw.githubusercontent.com/mini-jail/dom/main/mod.ts"

const App = () => {
  addElement("h1", (attr) => {
    attr.textContent = "soon"
  })
}

render(document.body, () => {
  App()
})
