---
name: structured-visualization
description: Implement timeline, process, hierarchy and scatter with source-linked records.
---
timeline: structure.events has id/date/label/source_id/quote/location per event. Dates use YYYY[-MM[-DD]] and true intervals; do not merge simultaneous events. process/hierarchy: nodes and edges; each edge has from/to/label/source_id/quote/location. Processes may contain evidenced loops; hierarchies are connected single-root trees without cycles or multiple parents. scatter: observations have id/x/y/source_id/quote/location; x_variable/x_unit/y_variable/y_unit are nonempty, including an explicit dimensionless unit when applicable. Never combine independent series into invented pairs. Fill every structure field, using empty unused lists and empty variables for nonscatter types. A structural component references one same-type fact; label_field and value_field are structure and unit is empty. Provide complete accessible records and evidence.
