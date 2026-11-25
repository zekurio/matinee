import "./platform/polyfills"
import "@matinee/tv/styles"
import { mountTv } from "@matinee/tv"

import { tizenPlatform } from "./platform/tizen"

/*
 * The Samsung TV package's whole app: the shared TV view, with Samsung's
 * player, keys, and device details underneath. The screens and their
 * state are the same ones the Solid web app serves at `/tv/`.
 */
const root = document.getElementById("app")
if (root) mountTv(root, tizenPlatform)
