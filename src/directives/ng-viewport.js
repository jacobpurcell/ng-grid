angular.module('ngGrid.directives').directive('ngViewport', ['$compile', '$domUtilityService', function ($compile, domUtilityService) {
    return function ($scope, elm) {
        var isMouseWheelActive;
        var prevScollLeft;
        var prevScollTop = 0;

        var canvas = $('.ngCanvas', elm);
        var template = "<div row-id='{{ row.rowIndex }}' ng-style=\"rowStyle(row)\" ng-click=\"row.toggleSelected($event)\" ng-class=\"row.alternatingRowClass()\" ng-row></div>\r";
        var currentlyRenderedRowsLookup = [];

        $scope.$on('ngGridEventRows', function (ctx, rowsToRender) {
            var currentlyRenderedRowsLength = currentlyRenderedRowsLookup && Object.keys(currentlyRenderedRowsLookup).length || 0;

            var rowsToRenderLookup = []; // array of row-data, indexed by row id
            var rowsToReplace = []; // array of Booleans, indexed by row id
            var newRowsToRender = []; // array of rows
            rowsToRender.forEach(function (row) {
                // keep track of rows that will be rendered and their associated data
                rowsToRenderLookup[row.rowIndex] = row;

                var currentlyRenderedRow = currentlyRenderedRowsLookup[row.rowIndex];

                if (!currentlyRenderedRow) { // if row not currently rendered, then render it.
                    newRowsToRender.push(row);
                }
                else if (currentlyRenderedRow.entity !== row.entity || currentlyRenderedRow.offsetTop !== row.offsetTop) {
                    // looking for rows that have already been rendered, but whose associated data, or position in the DOM, has changed.
                    // Note: this can happen when filtering (the indexes of rows are changed), and probably happens when grouping columns
                    rowsToReplace[row.rowIndex] = true;
                }
            });

            var rowsAlreadyRendered = currentlyRenderedRowsLookup
                && rowsToRender.length == currentlyRenderedRowsLength
                && rowsToReplace.length === 0
                && newRowsToRender.length === 0;

            if (rowsAlreadyRendered) {
                return;
            }

            var allHtmlRows = $('[ng-row]', canvas);

            // can this be done more efficiently
            rowsToReplace.length > 0 && allHtmlRows.toArray().forEach(function (renderedRow) {
                var indexOfRenderedRow = Number(renderedRow.attributes['row-id'].value);

                if (rowsToReplace[indexOfRenderedRow]) {
                    var scopeOfRowToReplace = angular.element(renderedRow).scope();
                    scopeOfRowToReplace.row = rowsToRenderLookup[indexOfRenderedRow];
                    scopeOfRowToReplace.row.elm = $(renderedRow);

                    domUtilityService.digest(scopeOfRowToReplace);
                }
            });


            if (currentlyRenderedRowsLength > rowsToRender.length) {
                removeExcessHtmlRows();
            }

            function removeExcessHtmlRows() {
                if (rowsToRender.length === 0) {
                    allHtmlRows.toArray().forEach(removeHtmlRowFromDom);
                }
                else {
                    allHtmlRows.each(function (idx, row) {
                        var $row = $(row);

                        // Note: Check if the row id is a number, as it may be an angular expression if the row hasn't been evaluated by angular yet
                        var rowIdAttr = $row.attr('row-id');
                        var rowIdAsString = isNaN(rowIdAttr)
                            ? angular.element(row).scope().$eval(rowIdAttr.replace("{{", "").replace("}}", ""))// remove curly braces and eval the row id if angular hasn't done it yet
                            : rowIdAttr;

                        var rowId = Number(rowIdAsString);
                        if (!rowsToRenderLookup[rowId]) {
                            removeHtmlRowFromDom($row);
                        }
                    });
                }
            }

            function removeHtmlRowFromDom(row) {
                var $row = angular.element(row);
                $row.scope().$destroy();
                $row.remove();
            }

            if (newRowsToRender.length) {
                var allRows = $('[ng-row]', canvas);

                newRowsToRender.forEach(function (rowToRender) {

                    if (allRows.length >= rowsToRender.length) { // reuse html rows when there are enough of them in the dom

                        // TODO: sort by top (absolute position), and replace based upon that value instead of rowIndex
                        var sortedRows = _(allRows) // sorting by the css value seems to be slow in IE, so using the row index instead
                            .sortBy(function (r) {
                                // Note: also may not be able to rely on this being a number yet, if angular hasn't evaluated it.   
                                return Number(r.attributes['row-id'].value); // sort by row-id
                            });

                        // if scrolling down re-use the first row, otherwise use the last
                        var currentlyRenderedRowIdxs = Object.keys(currentlyRenderedRowsLookup);
                        var rowToReuse = rowToRender.rowIndex > currentlyRenderedRowIdxs[currentlyRenderedRowIdxs.length - 1]
                                       ? sortedRows[0]
                                       : sortedRows[sortedRows.length - 1];
                        var scopeOfRowToReuse = angular.element(rowToReuse).scope();
                        rowToRender.elm = $(rowToReuse);
                        scopeOfRowToReuse.row = rowToRender;
                        domUtilityService.digest(scopeOfRowToReuse);
                    }
                    else {
                        var scopeOfRowToAdd = $scope.$new(false);
                        scopeOfRowToAdd.row = rowToRender;
                        var compiledRow = $compile(template)(scopeOfRowToAdd);
                        canvas.append(compiledRow);
                        scopeOfRowToAdd.row.elm = compiledRow;
                        domUtilityService.digest(scopeOfRowToAdd);
                        allRows.push(compiledRow[0]);
                    }
                });
            }

            currentlyRenderedRowsLookup = rowsToRenderLookup;
        });

        var delayRenderingTimer;
        elm.bind('scroll', function (evt) {

            var scrollLeft = evt.target.scrollLeft,
                scrollTop = evt.target.scrollTop;

            if ($scope.$headerContainer) {
                $scope.$headerContainer.scrollLeft(scrollLeft);
            }

            if (prevScollLeft != scrollLeft) {
                $scope.adjustScrollLeft(scrollLeft);
            }


            if (prevScollTop != scrollTop) {
                var gridSize = evt.target.clientHeight;

                if ($scope.forceSyncScrolling
                    || delayRenderingTimer == null && prevScollTop != scrollTop && Math.abs(prevScollTop - scrollTop) < gridSize * 2) {
                    $scope.adjustScrollTop(scrollTop);
                }
                else {
                    clearTimeout(delayRenderingTimer);

                    delayRenderingTimer = setTimeout(function () {
                        $scope.adjustScrollTop(scrollTop);
                        delayRenderingTimer = null;
                    }, 100);
                }
            }

            prevScollLeft = scrollLeft;
            prevScollTop = scrollTop;
            isMouseWheelActive = false;

            return true;
        });

        elm.bind("mousewheel DOMMouseScroll", function () {
            isMouseWheelActive = true;
            if (elm.focus) { elm.focus(); }
            return true;
        });

        if (!$scope.enableCellSelection) {
            $scope.domAccessProvider.selectionHandlers($scope, elm, domUtilityService);
        }
    };
}]);