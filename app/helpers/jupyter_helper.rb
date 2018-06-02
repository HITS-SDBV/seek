module JupyterHelper

  def write_from_json(json_to_write, json_obj)
    session.delete :extraction_exception_message
    begin
      outfile = File.new(json_to_write,"w")
      outfile.write(JSON.generate(json_obj))
      outfile.close()
    rescue Exception => e
      ExceptionNotifier.notify_exception(e, data: {
          message: "Jupyter notebooks: Error writing file from a JSON object:  #{json_to_write}",
          current_logged_in_user: current_user
      })
      session[:extraction_exception_message] = e.message
    end
  end

  def replace_placeholder_in_notebook_cell(json_notebook, cell, substitutions)
    json_notebook["cells"][cell]["source"].each_with_index do |line, i|
      substitutions.each do |key, value|
        line[key.to_s] = value
      end
      Rails.logger.info "Cell after Replace: " + json_notebook["cells"][cell]["source"][i].to_s
    end
    return json_notebook
  end

end