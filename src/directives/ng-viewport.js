angular.module('ngGrid.directives').directive('ngViewport', ['$compile', '$domUtilityService', function ($compile, domUtilityService) {
    return function ($scope, elm) {
        var isMouseWheelActive;
        var prevScollLeft;
        var prevScollTop = 0;

        var canvas = $('.ngCanvas', elm);
        var template = "<div row-id='{{ row.rowIndex }}' ng-style=\"rowStyle(row)\" ng-click=\"row.toggleSelected($event)\" ng-class=\"row.alternatingRowClass()\" ng-row></div>\r";
        var currentlyRenderedRowsLookup = [];

        // Note: it's important to try and keep this method performant as it is called whilst scrolling the grid.
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

            var areRowsAlreadyRendered = currentlyRenderedRowsLookup
                && rowsToRender.length == currentlyRenderedRowsLength
                && rowsToReplace.length === 0
                && newRowsToRender.length === 0;

            if (areRowsAlreadyRendered) {
                return;
            }

            /////////////////////////////////////////////////////////////////
            // replace rows whose data may have changed - e.g. when filtering
            /////////////////////////////////////////////////////////////////
            rowsToReplace.forEach(function (rowToReplace) {
                if (rowToReplace) {
                    var currentRowElement = currentlyRenderedRowsLookup[rowToReplace.rowIndex].elm;
                    rowToReplace.elm = currentRowElement;
                    var scopeOfRowToReplace = currentRowElement.scope();
                    scopeOfRowToReplace.row = rowToReplace;
                    domUtilityService.digest(scopeOfRowToReplace);
                    currentlyRenderedRowsLookup[rowToReplace.rowIndex] = rowToReplace;
                }
            });

            /////////////////////
            // remove excess rows
            /////////////////////
            if (currentlyRenderedRowsLength > rowsToRender.length) {

                currentlyRenderedRowsLookup.forEach(function (currentlyRenderedRow) {

                    if (!rowsToRenderLookup[currentlyRenderedRow.rowIndex]) {
                        removeHtmlRowFromDom(currentlyRenderedRow);
                    }

                });
            }

            function removeHtmlRowFromDom(row) {
                var $row = row.elm;
                $row.scope().$destroy();
                $row.remove();
                delete currentlyRenderedRowsLookup[row.rowIndex];
            }

            var allHtmlRows = $('[ng-row]', canvas);

            ////////////////////////////////////////////////////////////////////////////////////////////
            // add new rows to be rendered - if appropriate, reuse rows that are no longer on the screen
            ////////////////////////////////////////////////////////////////////////////////////////////
            if (newRowsToRender.length) {
                newRowsToRender.forEach(function (rowToRender) {

                    if (allHtmlRows.length >= rowsToRender.length) { // reuse html rows when there are enough of them in the dom

                        // Note: assuming that row index relates to the order of rows.  This may not be that case if aggregating rows.
                        // if scrolling down re-use the first row, otherwise use the last
                        var currentlyRenderedRowIdxsInOrder = Object.keys(currentlyRenderedRowsLookup);
                        var lastRowIdx = currentlyRenderedRowIdxsInOrder[currentlyRenderedRowIdxsInOrder.length - 1];
                        var rowToReuse = rowToRender.rowIndex > lastRowIdx
                                       ? currentlyRenderedRowsLookup[currentlyRenderedRowIdxsInOrder[0]]
                                       : currentlyRenderedRowsLookup[lastRowIdx];

                        // remove the row to be reused and add the row being rendered
                        delete currentlyRenderedRowsLookup[rowToReuse.rowIndex];
                        currentlyRenderedRowsLookup[rowToRender.rowIndex] = rowToRender;

                        // setup row's properties and digest its scope
                        var scopeOfRowToReuse = rowToReuse.elm.scope();
                        rowToRender.elm = rowToReuse.elm;
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
                        allHtmlRows.push(compiledRow[0]);
                        currentlyRenderedRowsLookup[rowToRender.rowIndex] = rowToRender;
                        currentlyRenderedRowsLength = currentlyRenderedRowsLookup.length;
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