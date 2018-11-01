describe('Spreadsheet Explorer Functions', function() {
    beforeEach(function() {
        this.timeout(10000);
        MagicLamp.load('data_files/explore');
    });
    //
    // afterEach(function() {
    //     MagicLamp.clean();
    // });

    it('select cells', function() {
        // $j("#selection_data").value = "B1:D20"
        // $j(".spreadsheet_button.requires_selection")[0].is(":visible")
         var button = $j('#applySelection');
         expect(button).to.have.$val('Apply Selection');

    });
});