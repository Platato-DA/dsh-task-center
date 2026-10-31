# Third-party notices

DSH Task Center is an independent community plugin. It is not an official
DeepSeek product and is not endorsed by DeepSeek. DeepSeek Harness is developed
by [DeepSeek AI](https://github.com/deepseek-ai/deepseek-harness) and licensed under
the [MIT license](https://github.com/deepseek-ai/deepseek-harness/blob/master/LICENSE).
Product names identify compatibility; their owners retain their rights.

The plugin's original code is covered by [BSD-3-Clause](LICENSE). Dependencies
retain their own licenses. The lockfile records the exact development versions.

| Component | Use | License |
| --- | --- | --- |
| `@deepseek-ai/cordis` | Plugin framework supplied by DSH | MIT |
| React | Shared UI runtime supplied by DSH; development types/build input | MIT |
| esbuild | Development bundler and test transpiler | MIT |
| TypeScript | Development type checker | Apache-2.0 |
| `@types/node`, `@types/react`, `@types/react-dom` | Development declarations | MIT |

React and Cordis are external to the built plugin bundles. The plugin does not
bundle the DSH application, its credentials, or its private runtime data. When
redistributing dependency packages, retain their accompanying license notices.
