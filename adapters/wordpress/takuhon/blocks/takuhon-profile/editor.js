/**
 * Editor UI for the `takuhon/profile` block.
 *
 * Hand-written against the WordPress runtime globals (`window.wp.*`) so it
 * needs no build step and bundles none of the @wordpress/* packages. The block
 * is server-rendered (see class-takuhon-block.php), so `save` returns null.
 */
(function (wp) {
  var el = wp.element.createElement;
  var Fragment = wp.element.Fragment;
  var registerBlockType = wp.blocks.registerBlockType;
  var useBlockProps = wp.blockEditor.useBlockProps;
  var InspectorControls = wp.blockEditor.InspectorControls;
  var PanelBody = wp.components.PanelBody;
  var SelectControl = wp.components.SelectControl;
  var TextControl = wp.components.TextControl;
  var __ = wp.i18n.__;

  registerBlockType('takuhon/profile', {
    edit: function (props) {
      var attributes = props.attributes;
      var setAttributes = props.setAttributes;
      var isRemote = 'remote' === attributes.mode;

      var summary = isRemote
        ? __('Takuhon profile (remote)', 'takuhon') +
          ': ' +
          (attributes.apiUrl || __('set an API URL', 'takuhon'))
        : __('Takuhon profile (this site)', 'takuhon');

      return el(
        Fragment,
        null,
        el(
          InspectorControls,
          null,
          el(
            PanelBody,
            { title: __('Takuhon', 'takuhon') },
            el(SelectControl, {
              label: __('Source', 'takuhon'),
              value: attributes.mode,
              options: [
                { label: __('This site', 'takuhon'), value: 'local' },
                { label: __('Remote API URL', 'takuhon'), value: 'remote' },
              ],
              onChange: function (mode) {
                setAttributes({ mode: mode });
              },
            }),
            isRemote
              ? el(TextControl, {
                  label: __('API URL', 'takuhon'),
                  value: attributes.apiUrl,
                  placeholder: 'https://example.com',
                  onChange: function (apiUrl) {
                    setAttributes({ apiUrl: apiUrl });
                  },
                })
              : null,
          ),
        ),
        el('div', useBlockProps(), el('p', null, summary)),
      );
    },
    save: function () {
      return null;
    },
  });
})(window.wp);
