// Allow side-effect CSS imports (`import './styles.css'`) in the widget build.
// The bundler turns this into an emitted stylesheet; for typechecking it is an
// opaque module with no exports.
declare module '*.css';
