define(function () {
  var ListeningPool = require('common/listening-pool');
  var dataSetCount  = 0;

  // TODO: placeholder function:
  function validateComponent (component) {
    // TODO: Validate component definition, use validated copy of the properties.
    // component = validator.validateCompleteness(metadata.graph, component);
    return component;
  }

  /**
   * DataSet: Manage Collections of data for tables, graphs, others.
   *
   * @constructor
   *
   * @param {Model} the model we are collecting data from
   */
  function DataSet(component, interactivesController) {
    this.interactivesController = interactivesController;
    this._model               = interactivesController.getModel();
    this.namespace            = "dataSet" + (++dataSetCount);
    this.component            = validateComponent(component);
    this.xPropertyName        = this.component.xProperty;
    this.modelProperties      = this.component.properties || [];
    this.streamDataFromModel  = this.component.streamDataFromModel;
    this.clearOnModelLoad     = this.component.clearOnModelLoad;
    this._dataSeriesArry      = [];  // [seriesa,seriesb,seriesc]
    this._listeningPool       = new ListeningPool(this.namespace);
    // this._addListeners();
  }

  DataSet.Events = {
    SAMPLE_ADDED:      "DataSet.SAMPLE_ADDED",
    NEW_SERIES:        "DataSet.NEW_SERIES",
    DATA_TRUNCATED:    "DataSet.DATA_TRUNCATED",
    DATA_RESET:        "DataSet.DATA_RESET",
    REMOVE_ALL_SERIES: "DataSet.REMOVE_ALL_SERIES",
    SELECTION_CHANGED: "DataSet.SELECTION_CHANGED"
  };

  /******************************************************************

  *******************************************************************/
  DataSet.prototype._inNewModelTerritory = function () {
    return (this._model.stepCounter() < this.numberOfPoints());
  };

  DataSet.prototype._addListeners = function() {
    var listeningPool  = this._listeningPool;
    var model          = this.interactivesController.getModel();
    var context        = this;

    var positionChanged = function() {
      context._trigger(DataSet.Events.SELECTION_CHANGED, model.stepCounter());
    };

    listeningPool.removeAll(); // remove previous listeners.
    listeningPool.listen(model, 'stepBack',    positionChanged);
    listeningPool.listen(model, 'stepForward', positionChanged);
    listeningPool.listen(model, 'seek',        positionChanged);

    listeningPool.listen(model, 'tick', function () {
      context.appendDataPoint();
    });

    listeningPool.listen(model, 'play', function() {
      if (context._inNewModelTerritory()) {
        context.removeDataAfterStepPointer();
      }
    });

    listeningPool.listen(model, 'invalidation', function() {
      context.removeDataAfterStepPointer();
    });
  };

  DataSet.prototype._getModelProperty = function (propName) {
    return this._model.get(propName);
  };

  /**
    Trigger a custom event for listeners.
    @param {series} [[x,y]] series values being added.
  */
  DataSet.prototype._trigger = function (name, params) {
    $(this).trigger(name, {'data' : params});
  };

  /**
    Returns an array containing two-element arrays each containing the current model
    time and the current value of each model property specified in component.properties.
    NP: Perhaps this should be named "LoadCurrentDatumForModel" -- it inserts each row of
    series data from the model.
  */
  DataSet.prototype.getDataPoint = function () {
    var ret = [], i, len, xval;

    xval = this._model.get(this.xPropertyName );
    for (i = 0, len = this.modelProperties.length; i < len; i++) {
      ret.push([xval, this._getModelProperty(this.modelProperties[i])]);
    }
    return ret;
  };

  /**
    Resets the cached data array to a single, initial data point, and pushes that data into graph.
  */
  DataSet.prototype.resetData = function () {
    var dataPoint        = this.getDataPoint();
    this._dataSeriesArry = [];
    var i;

    if (this.streamDataFromModel) {
      for (i = 0; i < dataPoint.length; i++) {
        this._dataSeriesArry[i] = [dataPoint[i]];
      }
    } else {
      for (i = 0; i < dataPoint.length; i++) {
        this._dataSeriesArry[i] = [];
      }
    }
    this._trigger(DataSet.Events.DATA_RESET, this._dataSeriesArry);
  };

  /**
    Appends the current data point (as returned by getDataPoint()) to the graph and to the cached
    data array
  */
  DataSet.prototype.appendDataPoint = function () {
    var dataPoint = this.getDataPoint();
    var i;

    for (i = 0; i < dataPoint.length; i++) {
      this._dataSeriesArry[i].push(dataPoint[i]);
    }
    // The grapher considers each individual (property, time) pair to be a "point", and therefore
    // considers the set of properties at any 1 time (what we consider a "point") to be "points".
    this._trigger(DataSet.Events.SAMPLE_ADDED, dataPoint);
  };


  /**
    Removes all data from the graph that correspond to steps following the current step pointer.
    This is used when a change is made that invalidates the future data.
  */
  DataSet.prototype.removeDataAfterStepPointer = function () {
    var i;
    var newLength = this._model.stepCounter() + 1;
    for (i = 0; i < this.modelProperties.length; i++) {
      // Account for initial data, which corresponds to stepCounter == 0
      this._dataSeriesArry[i].length = newLength;
    }
    // TODO: Should we return a copy of the array using .split?
    this._trigger(DataSet.Events.DATA_TRUNCATED, this._dataSeriesArry);
  };

  /**
    Add non-realtime dataset to the graph.
    @param {series} [[x,y]] series values being added.
  */
  DataSet.prototype.addStaticDataSeries = function (series) {
    this._dataSeriesArry.push(series);
    this._trigger(DataSet.Events.NEW_SERIES, series);
  };

  /**
    Remove all non-realtime datasets
  */
  DataSet.prototype.clearStaticDataSeries =  function () {
    this._dataSeriesArry.length = this.modelProperties.length;
    this._trigger(DataSet.Events.REMOVE_ALL_SERIES);
  };


  DataSet.prototype.modelLoadedCallback = function() {
    this._addListeners();
    if (this.clearOnModelLoad || this.isSetup) {
      this.resetData();
    }
  };
  return DataSet;
});